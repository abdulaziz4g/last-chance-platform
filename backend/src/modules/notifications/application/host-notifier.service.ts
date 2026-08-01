import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../domain/notification.port';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'HostNotifier' });

/** Human-readable reasons. The host sees these, so they say what to fix. */
const REASON_TEXT: Record<string, string> = {
  DOCUMENT_ILLEGIBLE: 'a document could not be read clearly',
  DOCUMENT_EXPIRED: 'a document has expired',
  DEED_NAME_MISMATCH: 'the name on the title deed does not match your account',
  PERMIT_INVALID: 'the tourism permit is not valid',
  PERMIT_NOT_FOUND: 'the tourism permit number was not found in the register',
  NATIONAL_ADDRESS_MISMATCH:
    'the National Address does not match the title deed',
  LOCATION_MISMATCH: 'the map location does not match the stated address',
  PHOTOS_INSUFFICIENT: 'the photos are insufficient or do not match the listing',
  PROHIBITED_CONTENT: 'the listing contains prohibited content',
  DUPLICATE_LISTING: 'this duplicates an existing listing',
  OTHER: 'a review issue',
};

/**
 * Formats a reviewer's free-text note into the message body. Terminates it if
 * the reviewer did not, so the sentence that follows does not run into it —
 * "Reported listing Existing confirmed bookings are unaffected" reads as
 * carelessness to the host on the receiving end.
 */
function reviewerNote(notes?: string | null): string {
  const trimmed = notes?.trim();
  if (!trimmed) return '';
  const terminated = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return ` Reviewer note: ${terminated}`;
}

interface HostContact {
  hostId: string;
  fullName: string;
  phone: string | null;
  email: string;
  locale: string;
}

/**
 * Tells a host what happened to their listing.
 *
 * Delivery is best-effort BY DESIGN: a moderation decision is already
 * committed and recorded in property_moderation_events before this runs, and
 * an SMS gateway being down must never roll back an admin's decision or make
 * the admin's request fail. Failures are logged loudly instead — the decision
 * trail is the record of truth, the message is a courtesy on top of it.
 */
@Injectable()
export class HostNotifierService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(NOTIFICATION_PORT) private readonly notifier: NotificationPort,
  ) {}

  async listingRejected(
    propertyId: string,
    reasonCode: string,
    notes?: string | null,
  ): Promise<void> {
    const contact = await this.contactFor(propertyId);
    if (!contact) return;

    const reason = REASON_TEXT[reasonCode] ?? 'a review issue';
    const detail = reviewerNote(notes);
    await this.fanOut(contact, {
      title: 'Listing needs changes',
      body:
        `Your Last Chance listing was not approved because ${reason}.` +
        `${detail} Fix it and resubmit from your host dashboard.`,
      reference: `moderation:rejected:${propertyId}`,
      data: { kind: 'LISTING_REJECTED', propertyId, reasonCode },
    });
  }

  async listingSuspended(
    propertyId: string,
    reasonCode: string,
    notes?: string | null,
  ): Promise<void> {
    const contact = await this.contactFor(propertyId);
    if (!contact) return;

    const reason = REASON_TEXT[reasonCode] ?? 'a review issue';
    const detail = reviewerNote(notes);
    await this.fanOut(contact, {
      title: 'Listing suspended',
      body:
        `Your Last Chance listing has been suspended because ${reason}.` +
        `${detail} Existing confirmed bookings are unaffected.`,
      reference: `moderation:suspended:${propertyId}`,
      data: { kind: 'LISTING_SUSPENDED', propertyId, reasonCode },
    });
  }

  async listingApproved(propertyId: string): Promise<void> {
    const contact = await this.contactFor(propertyId);
    if (!contact) return;

    await this.fanOut(contact, {
      title: 'Listing approved',
      body: 'Your Last Chance listing is approved and now live on the map.',
      reference: `moderation:approved:${propertyId}`,
      data: { kind: 'LISTING_APPROVED', propertyId },
    });
  }

  // -------------------------------------------------------------------------

  /**
   * SMS where we have a verified number, email otherwise. Both are attempted
   * rather than only the "best" one: a listing being pulled off the market is
   * worth telling someone twice.
   */
  private async fanOut(
    contact: HostContact,
    message: {
      title: string;
      body: string;
      reference: string;
      data: Record<string, string>;
    },
  ): Promise<void> {
    const targets: Array<{ channel: 'SMS' | 'EMAIL'; to: string }> = [];
    if (contact.phone) targets.push({ channel: 'SMS', to: contact.phone });
    targets.push({ channel: 'EMAIL', to: contact.email });

    for (const target of targets) {
      try {
        const result = await this.notifier.send({
          channel: target.channel,
          to: target.to,
          title: message.title,
          body: message.body,
          reference: message.reference,
          data: message.data,
        });
        if (!result.accepted) {
          log.warn(
            {
              channel: target.channel,
              hostId: contact.hostId,
              reason: result.failureReason,
              reference: message.reference,
            },
            'Host notification refused by provider',
          );
        }
      } catch (err) {
        // Never rethrow: the decision is committed and must stand.
        log.error(
          { err, channel: target.channel, hostId: contact.hostId },
          'Host notification failed to send',
        );
      }
    }
  }

  private async contactFor(propertyId: string): Promise<HostContact | null> {
    const res = await this.db.query<{
      host_id: string;
      full_name: string;
      phone: string | null;
      email: string;
      locale: string;
      phone_verified_at: Date | null;
    }>(
      `SELECT u.id AS host_id, u.full_name, u.phone, u.email::text, u.locale,
              u.phone_verified_at
         FROM properties p
         JOIN users u ON u.id = p.host_id
        WHERE p.id = $1`,
      [propertyId],
    );
    const row = res.rows[0];
    if (!row) {
      log.error({ propertyId }, 'No host contact for property');
      return null;
    }
    return {
      hostId: row.host_id,
      fullName: row.full_name,
      // An unverified number is not a delivery address: texting it could send
      // someone else's listing decision to a stranger who mistyped a digit.
      phone: row.phone_verified_at ? row.phone : null,
      email: row.email,
      locale: row.locale,
    };
  }
}
