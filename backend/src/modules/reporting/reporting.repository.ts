import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';

/**
 * Read-side queries for the dashboards (CQRS-lite): denormalized joins,
 * no domain logic, no writes. Kept separate from the transactional
 * repositories so reporting shape changes never touch the booking core.
 */

export interface AdminOverview {
  activeHolds: number;
  confirmedUpcoming: number;
  bookings24h: number;
  captured24hMinor: number;
  payoutsPaidMinor: number;
  failedWebhooks: number;
}

export interface BookingListItem {
  id: string;
  bookingCode: string;
  status: string;
  bookingType: string;
  checkInUtc: string;
  checkOutUtc: string;
  totalAmountMinor: number;
  currency: string;
  createdAt: string;
  unitName: string;
  propertyName: string;
  guestName: string;
}

/** One page of rows plus the unpaginated total, for page controls. */
export interface Paged<T> {
  items: T[];
  total: number;
}

/**
 * Separates the `COUNT(*) OVER ()` column from the rows it travelled with.
 *
 * The count rides inside the same statement so a page and its total always
 * describe one snapshot — computing them separately lets rows appear or vanish
 * between the two queries, which shows up as a page control that disagrees
 * with the page beneath it. The column is stripped here so callers never see
 * a bookkeeping field in their data.
 */
function paged<T extends Record<string, unknown>>(
  rows: (T & { total_count?: string })[],
): Paged<T> {
  const total = rows[0] ? Number(rows[0].total_count) : 0;
  const items = rows.map((row) => {
    const { total_count: _count, ...rest } = row;
    return rest as unknown as T;
  });
  return { items, total };
}

@Injectable()
export class ReportingRepository {
  constructor(private readonly db: DatabaseService) {}

  async adminOverview(): Promise<AdminOverview> {
    const res = await this.db.query<{
      active_holds: number;
      confirmed_upcoming: number;
      bookings_24h: number;
      captured_24h_minor: number;
      payouts_paid_minor: number;
      failed_webhooks: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM bookings WHERE status = 'PENDING_PAYMENT') AS active_holds,
         (SELECT count(*)::int FROM bookings
            WHERE status IN ('CONFIRMED', 'CHECKED_IN')
              AND check_out_utc > now()) AS confirmed_upcoming,
         (SELECT count(*)::int FROM bookings
            WHERE created_at >= now() - interval '24 hours') AS bookings_24h,
         (SELECT COALESCE(sum(amount_minor), 0)::bigint FROM payments
            WHERE captured_at >= now() - interval '24 hours') AS captured_24h_minor,
         (SELECT COALESCE(sum(amount_minor), 0)::bigint FROM payouts
            WHERE status = 'PAID') AS payouts_paid_minor,
         (SELECT count(*)::int FROM payment_webhook_events
            WHERE processing_status = 'FAILED') AS failed_webhooks`,
    );
    const r = res.rows[0];
    return {
      activeHolds: r.active_holds,
      confirmedUpcoming: r.confirmed_upcoming,
      bookings24h: r.bookings_24h,
      captured24hMinor: r.captured_24h_minor,
      payoutsPaidMinor: r.payouts_paid_minor,
      failedWebhooks: r.failed_webhooks,
    };
  }

  async recentBookings(
    limit: number,
    hostId?: string,
    offset = 0,
  ): Promise<Paged<BookingListItem>> {
    const res = await this.db.query<{
      id: string;
      booking_code: string;
      status: string;
      booking_type: string;
      check_in_utc: Date;
      check_out_utc: Date;
      total_amount_minor: number;
      currency: string;
      created_at: Date;
      unit_name: string;
      property_name: string;
      guest_name: string;
      total_count: string;
    }>(
      `SELECT b.id, b.booking_code, b.status::text, b.booking_type::text,
              b.check_in_utc, b.check_out_utc, b.total_amount_minor,
              b.currency, b.created_at,
              u.name AS unit_name, p.name AS property_name,
              g.full_name AS guest_name,
              COUNT(*) OVER () AS total_count
       FROM bookings b
       JOIN units u ON u.id = b.unit_id
       JOIN properties p ON p.id = b.property_id
       JOIN users g ON g.id = b.guest_id
       WHERE ($2::uuid IS NULL OR p.host_id = $2::uuid)
       ORDER BY b.created_at DESC
       LIMIT $1 OFFSET $3`,
      [limit, hostId ?? null, offset],
    );
    return {
      items: res.rows.map((r) => ({
        id: r.id,
        bookingCode: r.booking_code,
        status: r.status,
        bookingType: r.booking_type,
        checkInUtc: r.check_in_utc.toISOString(),
        checkOutUtc: r.check_out_utc.toISOString(),
        totalAmountMinor: r.total_amount_minor,
        currency: r.currency,
        createdAt: r.created_at.toISOString(),
        unitName: r.unit_name,
        propertyName: r.property_name,
        guestName: r.guest_name,
      })),
      total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
    };
  }

  async recentPayments(
    limit: number,
    offset = 0,
  ): Promise<Paged<Record<string, unknown>>> {
    const res = await this.db.query(
      `SELECT pm.id, pm.status::text, pm.provider::text, pm.method::text,
              pm.amount_minor AS "amountMinor", pm.currency,
              pm.refunded_amount_minor AS "refundedAmountMinor",
              pm.captured_at AS "capturedAt", pm.created_at AS "createdAt",
              b.booking_code AS "bookingCode",
              COUNT(*) OVER () AS total_count
       FROM payments pm
       JOIN bookings b ON b.id = pm.booking_id
       ORDER BY pm.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return paged(res.rows);
  }

  async recentPayouts(
    limit: number,
    offset = 0,
  ): Promise<Paged<Record<string, unknown>>> {
    const res = await this.db.query(
      `SELECT po.id, po.status::text, po.amount_minor AS "amountMinor",
              po.currency, po.provider::text,
              po.provider_transfer_id AS "providerTransferId",
              po.paid_at AS "paidAt", po.created_at AS "createdAt",
              b.booking_code AS "bookingCode", h.display_name AS "hostName",
              COUNT(*) OVER () AS total_count
       FROM payouts po
       JOIN bookings b ON b.id = po.booking_id
       JOIN host_profiles h ON h.user_id = po.host_id
       ORDER BY po.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return paged(res.rows);
  }

  async ledgerBalances(): Promise<Record<string, unknown>[]> {
    const res = await this.db.query(
      `SELECT account::text, currency,
              COALESCE(sum(CASE direction WHEN 'CREDIT' THEN amount_minor
                                          ELSE -amount_minor END), 0)::bigint AS "balanceMinor",
              count(*)::int AS entries
       FROM ledger_entries
       GROUP BY account, currency
       ORDER BY account`,
    );
    return res.rows;
  }

  async recentLedgerEntries(
    limit: number,
    offset = 0,
  ): Promise<Paged<Record<string, unknown>>> {
    const res = await this.db.query(
      `SELECT le.id, le.entry_group_id AS "groupId", le.account::text,
              le.direction::text, le.amount_minor AS "amountMinor",
              le.currency, le.description, le.created_at AS "createdAt",
              b.booking_code AS "bookingCode",
              COUNT(*) OVER () AS total_count
       FROM ledger_entries le
       LEFT JOIN bookings b ON b.id = le.booking_id
       ORDER BY le.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return paged(res.rows);
  }

  async recentWebhookEvents(
    limit: number,
    offset = 0,
  ): Promise<Paged<Record<string, unknown>>> {
    const res = await this.db.query(
      `SELECT id, provider::text, event_id AS "eventId",
              event_type AS "eventType", processing_status::text AS "status",
              signature_valid AS "signatureValid", attempts,
              received_at AS "receivedAt", processed_at AS "processedAt",
              COUNT(*) OVER () AS total_count
       FROM payment_webhook_events
       ORDER BY received_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return paged(res.rows);
  }

  async hostOverview(hostId: string): Promise<Record<string, unknown> | null> {
    const host = await this.db.query<{
      user_id: string;
      display_name: string;
      rating_avg: number | null;
      rating_count: number;
    }>(
      `SELECT user_id, display_name, rating_avg, rating_count
       FROM host_profiles WHERE user_id = $1`,
      [hostId],
    );
    const h = host.rows[0];
    if (!h) return null;

    const [units, earnings, upcoming] = await Promise.all([
      this.db.query(
        `SELECT u.id, u.name, u.status::text, u.currency,
                u.base_hourly_rate_minor AS "hourlyRateMinor",
                u.base_nightly_rate_minor AS "nightlyRateMinor",
                u.supports_hourly AS "supportsHourly",
                u.supports_nightly AS "supportsNightly",
                p.name AS "propertyName"
         FROM units u
         JOIN properties p ON p.id = u.property_id
         WHERE p.host_id = $1 AND u.deleted_at IS NULL
         ORDER BY p.name, u.name`,
        [h.user_id],
      ),
      this.db.query<{ paid: number; pending: number }>(
        `SELECT
           COALESCE(sum(amount_minor) FILTER (WHERE status = 'PAID'), 0)::bigint AS paid,
           COALESCE(sum(amount_minor) FILTER (WHERE status IN ('PENDING', 'IN_TRANSIT')), 0)::bigint AS pending
         FROM payouts WHERE host_id = $1`,
        [h.user_id],
      ),
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM bookings b JOIN properties p ON p.id = b.property_id
         WHERE p.host_id = $1
           AND b.status IN ('CONFIRMED', 'CHECKED_IN')
           AND b.check_out_utc > now()`,
        [h.user_id],
      ),
    ]);

    return {
      hostId: h.user_id,
      displayName: h.display_name,
      ratingAvg: h.rating_avg,
      ratingCount: h.rating_count,
      units: units.rows,
      earningsPaidMinor: earnings.rows[0]?.paid ?? 0,
      earningsPendingMinor: earnings.rows[0]?.pending ?? 0,
      upcomingStays: upcoming.rows[0]?.n ?? 0,
      bookings: await this.recentBookings(20, h.user_id),
    };
  }
}
