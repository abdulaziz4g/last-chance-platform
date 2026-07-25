import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';

/** Keeps a listing from accumulating an unbounded gallery. */
export const MAX_PHOTOS_PER_UNIT = 12;

@Injectable()
export class UnitPhotoRepository {
  constructor(private readonly db: DatabaseService) {}

  /** The host who owns the unit's property, or null if no such unit. */
  async findOwnerHostId(unitId: string): Promise<string | null> {
    const res = await this.db.query<{ host_id: string }>(
      `SELECT p.host_id
         FROM units u
         JOIN properties p ON p.id = u.property_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [unitId],
    );
    return res.rows[0]?.host_id ?? null;
  }

  async list(unitId: string): Promise<string[]> {
    const res = await this.db.query<{ photos: unknown }>(
      `SELECT photos FROM units WHERE id = $1`,
      [unitId],
    );
    const photos = res.rows[0]?.photos;
    return Array.isArray(photos) ? (photos as string[]) : [];
  }

  /**
   * Appends in a single statement so two concurrent uploads cannot read the
   * same array and write back over each other. The cap is enforced in the
   * same expression for the same reason.
   */
  async append(unitId: string, url: string): Promise<string[]> {
    const res = await this.db.query<{ photos: unknown }>(
      `UPDATE units
          SET photos = photos || to_jsonb($2::text)
        WHERE id = $1
          AND jsonb_array_length(photos) < $3
        RETURNING photos`,
      [unitId, url, MAX_PHOTOS_PER_UNIT],
    );
    if (res.rowCount === 0) return [];
    const photos = res.rows[0].photos;
    return Array.isArray(photos) ? (photos as string[]) : [];
  }

  async remove(unitId: string, url: string): Promise<string[]> {
    const res = await this.db.query<{ photos: unknown }>(
      `UPDATE units
          SET photos = COALESCE(
                (SELECT jsonb_agg(elem)
                   FROM jsonb_array_elements(photos) AS elem
                  WHERE elem <> to_jsonb($2::text)),
                '[]'::jsonb
              )
        WHERE id = $1
        RETURNING photos`,
      [unitId, url],
    );
    const photos = res.rows[0]?.photos;
    return Array.isArray(photos) ? (photos as string[]) : [];
  }
}
