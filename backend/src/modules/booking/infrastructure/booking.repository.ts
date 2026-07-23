import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  Booking,
  BookingSource,
  BookingStatus,
  BookingType,
} from '../domain/types';
import type { PriceQuote } from '../application/pricing.service';

interface BookingRow {
  id: string;
  booking_code: string;
  guest_id: string;
  unit_id: string;
  property_id: string;
  booking_type: BookingType;
  status: BookingStatus;
  source: BookingSource;
  check_in_utc: Date;
  check_out_utc: Date;
  turnaround_minutes: number;
  guests_count: number;
  hold_expires_at: Date | null;
  currency: string;
  base_amount_minor: number;
  cleaning_fee_minor: number;
  service_fee_minor: number;
  taxes_minor: number;
  discount_minor: number;
  total_amount_minor: number;
  commission_pct: number;
  commission_minor: number;
  host_payout_minor: number;
  flash_deal_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const BOOKING_COLUMNS = `
  id, booking_code, guest_id, unit_id, property_id, booking_type, status,
  source, check_in_utc, check_out_utc, turnaround_minutes, guests_count,
  hold_expires_at, currency, base_amount_minor, cleaning_fee_minor,
  service_fee_minor, taxes_minor, discount_minor, total_amount_minor,
  commission_pct, commission_minor, host_payout_minor, flash_deal_id,
  created_at, updated_at`;

export interface InsertHoldParams {
  guestId: string;
  unitId: string;
  propertyId: string;
  bookingType: BookingType;
  source: BookingSource;
  checkInUtc: Date;
  checkOutUtc: Date;
  turnaroundMinutes: number;
  guestsCount: number;
  holdExpiresAt: Date;
  quote: PriceQuote;
  /** Set when this hold was placed by claiming a flash deal. */
  flashDealId?: string | null;
}

/**
 * All booking SQL lives here. Status changes are compare-and-swap UPDATEs
 * (`WHERE status = $expected`): 0 rows affected means a concurrent
 * transition won — callers decide what that means. The DB FSM trigger
 * remains the final authority behind every statement in this file.
 */
@Injectable()
export class BookingRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * UX pre-check only — the exclusion constraint is the guarantee. Runs
   * inside the hold transaction (and under the unit lock) so the common
   * conflict case returns a friendly error without burning an insert.
   */
  async hasConflict(
    client: PoolClient,
    unitId: string,
    checkInUtc: Date,
    checkOutUtc: Date,
    turnaroundMinutes: number,
  ): Promise<boolean> {
    const res = await client.query<{ conflict: boolean }>(
      `SELECT (
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.unit_id = $1
             AND b.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
             AND b.block_range && fn_booking_block_range($2, $3, $4)
         )
         OR EXISTS (
           SELECT 1 FROM unit_availability_blocks ub
           WHERE ub.unit_id = $1
             AND ub.is_active
             AND ub.block_range && fn_booking_block_range($2, $3, $4)
         )
       ) AS conflict`,
      [unitId, checkInUtc, checkOutUtc, turnaroundMinutes],
    );
    return res.rows[0]?.conflict ?? true;
  }

  async insertHold(
    client: PoolClient,
    p: InsertHoldParams,
  ): Promise<Booking> {
    const res = await client.query<BookingRow>(
      `INSERT INTO bookings (
         guest_id, unit_id, property_id, booking_type, status, source,
         check_in_utc, check_out_utc, turnaround_minutes, guests_count,
         hold_expires_at, currency,
         base_amount_minor, cleaning_fee_minor, service_fee_minor,
         taxes_minor, discount_minor, total_amount_minor,
         commission_pct, commission_minor, host_payout_minor, flash_deal_id
       ) VALUES (
         $1, $2, $3, $4, 'PENDING_PAYMENT', $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
       )
       RETURNING ${BOOKING_COLUMNS}`,
      [
        p.guestId,
        p.unitId,
        p.propertyId,
        p.bookingType,
        p.source,
        p.checkInUtc,
        p.checkOutUtc,
        p.turnaroundMinutes,
        p.guestsCount,
        p.holdExpiresAt,
        p.quote.currency,
        p.quote.baseAmountMinor,
        p.quote.cleaningFeeMinor,
        p.quote.serviceFeeMinor,
        p.quote.taxesMinor,
        p.quote.discountMinor,
        p.quote.totalAmountMinor,
        p.quote.commissionPct,
        p.quote.commissionMinor,
        p.quote.hostPayoutMinor,
        p.flashDealId ?? null,
      ],
    );
    return toBooking(res.rows[0]);
  }

  async findById(id: string): Promise<Booking | null> {
    const res = await this.db.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? toBooking(res.rows[0]) : null;
  }

  /** CAS: PENDING_PAYMENT -> CONFIRMED, only while the hold is still alive. */
  async confirmHold(id: string): Promise<Booking | null> {
    const res = await this.db.query<BookingRow>(
      `UPDATE bookings
       SET status = 'CONFIRMED'
       WHERE id = $1
         AND status = 'PENDING_PAYMENT'
         AND hold_expires_at > now()
       RETURNING ${BOOKING_COLUMNS}`,
      [id],
    );
    return res.rows[0] ? toBooking(res.rows[0]) : null;
  }

  /** Generic CAS transition for CHECKED_IN / COMPLETED style moves. */
  async transition(
    id: string,
    from: BookingStatus,
    to: BookingStatus,
  ): Promise<Booking | null> {
    const res = await this.db.query<BookingRow>(
      `UPDATE bookings SET status = $3
       WHERE id = $1 AND status = $2
       RETURNING ${BOOKING_COLUMNS}`,
      [id, from, to],
    );
    return res.rows[0] ? toBooking(res.rows[0]) : null;
  }

  async cancel(
    id: string,
    from: BookingStatus,
    cancelledBy: string,
    reason: string | null,
  ): Promise<Booking | null> {
    const res = await this.db.query<BookingRow>(
      `UPDATE bookings
       SET status = 'CANCELLED',
           cancelled_at = now(),
           cancelled_by = $3::actor_type,
           cancellation_reason = $4
       WHERE id = $1 AND status = $2
       RETURNING ${BOOKING_COLUMNS}`,
      [id, from, cancelledBy, reason],
    );
    return res.rows[0] ? toBooking(res.rows[0]) : null;
  }

  /** Idempotent expiry: only a still-pending, actually-lapsed hold flips. */
  async expireIfLapsed(id: string): Promise<Booking | null> {
    const res = await this.db.query<BookingRow>(
      `UPDATE bookings
       SET status = 'EXPIRED'
       WHERE id = $1
         AND status = 'PENDING_PAYMENT'
         AND hold_expires_at <= now()
       RETURNING ${BOOKING_COLUMNS}`,
      [id],
    );
    return res.rows[0] ? toBooking(res.rows[0]) : null;
  }

  /** Safety-net sweep via the Phase 1 SQL function (SKIP LOCKED batches). */
  async sweepStaleHolds(): Promise<string[]> {
    const res = await this.db.query<{ fn_expire_stale_holds: string }>(
      'SELECT fn_expire_stale_holds(500)',
    );
    return res.rows.map((r) => r.fn_expire_stale_holds);
  }
}

const toBooking = (r: BookingRow): Booking => ({
  id: r.id,
  bookingCode: r.booking_code,
  guestId: r.guest_id,
  unitId: r.unit_id,
  propertyId: r.property_id,
  bookingType: r.booking_type,
  status: r.status,
  source: r.source,
  checkInUtc: r.check_in_utc,
  checkOutUtc: r.check_out_utc,
  turnaroundMinutes: r.turnaround_minutes,
  guestsCount: r.guests_count,
  holdExpiresAt: r.hold_expires_at,
  currency: r.currency,
  baseAmountMinor: r.base_amount_minor,
  cleaningFeeMinor: r.cleaning_fee_minor,
  serviceFeeMinor: r.service_fee_minor,
  taxesMinor: r.taxes_minor,
  discountMinor: r.discount_minor,
  totalAmountMinor: r.total_amount_minor,
  commissionPct: r.commission_pct,
  commissionMinor: r.commission_minor,
  hostPayoutMinor: r.host_payout_minor,
  flashDealId: r.flash_deal_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
