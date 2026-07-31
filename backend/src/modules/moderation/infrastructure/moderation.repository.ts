import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { PropertyNotFoundError } from '../../../common/errors/domain-errors';
import type {
  ModerationEvent,
  ModerationQueueItem,
  ModerationReasonCode,
  ModerationStatus,
  PropertyDocument,
  PropertyDocumentType,
} from '../domain/types';

interface QueueRow {
  property_id: string;
  name: string;
  slug: string;
  property_type: string;
  city: string;
  district: string | null;
  country_code: string;
  moderation_status: ModerationStatus;
  submitted_at: Date | null;
  host_id: string;
  host_display_name: string;
  host_kyc_status: string;
  national_short_address: string | null;
  building_number: string | null;
  additional_number: string | null;
  tourism_permit_number: string | null;
  tourism_permit_expires_at: string | null;
  unit_count: string;
  document_count: string;
  has_deed: boolean;
  has_permit_doc: boolean;
  permit_expired: boolean;
}

const QUEUE_SELECT = `
  SELECT p.id AS property_id, p.name, p.slug, p.property_type::text,
         p.city, p.district, p.country_code,
         p.moderation_status, p.submitted_at,
         p.national_short_address, p.building_number, p.additional_number,
         p.tourism_permit_number, p.tourism_permit_expires_at::text,
         h.user_id AS host_id, h.display_name AS host_display_name,
         h.kyc_status::text AS host_kyc_status,
         (SELECT count(*) FROM units u
           WHERE u.property_id = p.id AND u.deleted_at IS NULL)::text AS unit_count,
         (SELECT count(*) FROM property_documents d
           WHERE d.property_id = p.id AND d.deleted_at IS NULL)::text AS document_count,
         EXISTS (SELECT 1 FROM property_documents d
                  WHERE d.property_id = p.id AND d.deleted_at IS NULL
                    AND d.document_type IN ('TITLE_DEED', 'LEASE_CONTRACT')) AS has_deed,
         EXISTS (SELECT 1 FROM property_documents d
                  WHERE d.property_id = p.id AND d.deleted_at IS NULL
                    AND d.document_type = 'TOURISM_PERMIT') AS has_permit_doc,
         COALESCE(p.tourism_permit_expires_at < current_date, false) AS permit_expired
    FROM properties p
    JOIN host_profiles h ON h.user_id = p.host_id
   WHERE p.deleted_at IS NULL`;

/**
 * Compliance gaps that would block an approval. Computed here rather than
 * stored so the queue always reflects the CURRENT document set — a host who
 * uploads a missing deed while their listing sits in the queue should see the
 * blocker disappear without anyone re-running a check.
 */
function blockersFor(row: QueueRow): string[] {
  const out: string[] = [];
  if (!row.national_short_address) out.push('NATIONAL_ADDRESS_MISSING');
  if (!row.tourism_permit_number) out.push('PERMIT_NUMBER_MISSING');
  if (!row.tourism_permit_expires_at) out.push('PERMIT_EXPIRY_MISSING');
  if (row.permit_expired) out.push('PERMIT_EXPIRED');
  if (!row.has_deed) out.push('DEED_OR_LEASE_MISSING');
  if (!row.has_permit_doc) out.push('PERMIT_DOCUMENT_MISSING');
  if (row.host_kyc_status !== 'VERIFIED') out.push('HOST_KYC_INCOMPLETE');
  if (Number(row.unit_count) === 0) out.push('NO_UNITS');
  return out;
}

const toQueueItem = (row: QueueRow): ModerationQueueItem => ({
  propertyId: row.property_id,
  name: row.name,
  slug: row.slug,
  propertyType: row.property_type,
  city: row.city,
  district: row.district,
  countryCode: row.country_code,
  moderationStatus: row.moderation_status,
  submittedAt: row.submitted_at,
  hostId: row.host_id,
  hostDisplayName: row.host_display_name,
  hostKycStatus: row.host_kyc_status,
  nationalShortAddress: row.national_short_address,
  buildingNumber: row.building_number,
  additionalNumber: row.additional_number,
  tourismPermitNumber: row.tourism_permit_number,
  tourismPermitExpiresAt: row.tourism_permit_expires_at,
  unitCount: Number(row.unit_count),
  documentCount: Number(row.document_count),
  blockers: blockersFor(row),
});

@Injectable()
export class ModerationRepository {
  constructor(private readonly db: DatabaseService) {}

  async findQueue(
    status: ModerationStatus | null,
    limit: number,
  ): Promise<ModerationQueueItem[]> {
    const res = await this.db.query<QueueRow>(
      `${QUEUE_SELECT}
         AND ($1::moderation_status IS NULL OR p.moderation_status = $1)
       ORDER BY p.submitted_at ASC NULLS LAST, p.created_at ASC
       LIMIT $2`,
      [status, limit],
    );
    return res.rows.map(toQueueItem);
  }

  async findOne(propertyId: string): Promise<ModerationQueueItem> {
    const res = await this.db.query<QueueRow>(
      `${QUEUE_SELECT} AND p.id = $1`,
      [propertyId],
    );
    const row = res.rows[0];
    if (!row) throw new PropertyNotFoundError(propertyId);
    return toQueueItem(row);
  }

  async currentStatus(propertyId: string): Promise<ModerationStatus> {
    const res = await this.db.query<{ moderation_status: ModerationStatus }>(
      `SELECT moderation_status FROM properties
        WHERE id = $1 AND deleted_at IS NULL`,
      [propertyId],
    );
    const row = res.rows[0];
    if (!row) throw new PropertyNotFoundError(propertyId);
    return row.moderation_status;
  }

  /**
   * Applies a moderation transition inside one transaction.
   *
   * The reason code and notes travel to the logging trigger through
   * transaction-local GUCs, mirroring the app.actor_id / app.request_id
   * contract that DatabaseService.stampContext already establishes. They must
   * be set on the SAME connection and inside the SAME transaction as the
   * UPDATE, which is why this is a transaction() rather than a query().
   *
   * The CAS on moderation_status makes concurrent admin clicks safe: the
   * second one matches zero rows rather than double-applying.
   */
  async transition(params: {
    propertyId: string;
    from: ModerationStatus;
    to: ModerationStatus;
    reasonCode?: ModerationReasonCode | null;
    notes?: string | null;
    /** Approving also brings the listing online (the spec's is_active = true). */
    activate?: boolean;
  }): Promise<ModerationStatus | null> {
    return this.db.transaction(async (client: PoolClient) => {
      await client.query(
        `SELECT set_config('app.moderation_reason', $1, true),
                set_config('app.moderation_notes',  $2, true)`,
        [params.reasonCode ?? '', params.notes ?? ''],
      );

      const res = await client.query<{ moderation_status: ModerationStatus }>(
        `UPDATE properties
            SET moderation_status = $3::moderation_status,
                status = CASE WHEN $4::boolean THEN 'ACTIVE'::property_status
                              ELSE status END
          WHERE id = $1 AND deleted_at IS NULL
            AND moderation_status = $2::moderation_status
        RETURNING moderation_status`,
        [params.propertyId, params.from, params.to, params.activate ?? false],
      );
      return res.rows[0]?.moderation_status ?? null;
    });
  }

  async history(propertyId: string, limit = 50): Promise<ModerationEvent[]> {
    const res = await this.db.query<{
      id: string;
      property_id: string;
      from_status: ModerationStatus | null;
      to_status: ModerationStatus;
      actor_type: string;
      actor_id: string | null;
      reason_code: ModerationReasonCode | null;
      notes: string | null;
      created_at: Date;
    }>(
      `SELECT id::text, property_id, from_status, to_status,
              actor_type::text, actor_id, reason_code, notes, created_at
         FROM property_moderation_events
        WHERE property_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [propertyId, limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      actorType: r.actor_type,
      actorId: r.actor_id,
      reasonCode: r.reason_code,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

  async listDocuments(propertyId: string): Promise<PropertyDocument[]> {
    const res = await this.db.query<{
      id: string;
      property_id: string;
      document_type: PropertyDocumentType;
      file_name: string;
      content_type: string;
      size_bytes: number;
      issued_on: string | null;
      expires_on: string | null;
      uploaded_by: string;
      verified_by: string | null;
      verified_at: Date | null;
      review_note: string | null;
      created_at: Date;
    }>(
      `SELECT id, property_id, document_type, file_name, content_type, size_bytes,
              issued_on::text, expires_on::text, uploaded_by, verified_by,
              verified_at, review_note, created_at
         FROM property_documents
        WHERE property_id = $1 AND deleted_at IS NULL
        ORDER BY document_type`,
      [propertyId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      documentType: r.document_type,
      fileName: r.file_name,
      contentType: r.content_type,
      sizeBytes: r.size_bytes,
      issuedOn: r.issued_on,
      expiresOn: r.expires_on,
      uploadedBy: r.uploaded_by,
      verifiedBy: r.verified_by,
      verifiedAt: r.verified_at,
      reviewNote: r.review_note,
      createdAt: r.created_at,
    }));
  }

  /** Storage key for one document — the input to a signed-URL grant. */
  async storageKeyFor(
    propertyId: string,
    documentId: string,
  ): Promise<{ storageKey: string; contentType: string; fileName: string } | null> {
    const res = await this.db.query<{
      storage_key: string;
      content_type: string;
      file_name: string;
    }>(
      `SELECT storage_key, content_type, file_name
         FROM property_documents
        WHERE id = $1 AND property_id = $2 AND deleted_at IS NULL`,
      [documentId, propertyId],
    );
    const row = res.rows[0];
    return row
      ? {
          storageKey: row.storage_key,
          contentType: row.content_type,
          fileName: row.file_name,
        }
      : null;
  }

  async hostIdFor(propertyId: string): Promise<string> {
    const res = await this.db.query<{ host_id: string }>(
      `SELECT host_id FROM properties WHERE id = $1 AND deleted_at IS NULL`,
      [propertyId],
    );
    const row = res.rows[0];
    if (!row) throw new PropertyNotFoundError(propertyId);
    return row.host_id;
  }
}
