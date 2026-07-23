import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { PaymentProviderName, Payout, PayoutStatus } from '../domain/types';

interface PayoutRow {
  id: string;
  host_id: string;
  booking_id: string;
  status: PayoutStatus;
  amount_minor: number;
  currency: string;
  provider: PaymentProviderName | null;
  provider_transfer_id: string | null;
  paid_at: Date | null;
  created_at: Date;
}

const COLS = `id, host_id, booking_id, status, amount_minor, currency,
              provider, provider_transfer_id, paid_at, created_at`;

@Injectable()
export class PayoutRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * UNIQUE (booking_id) is the double-payout guard: a second create for the
   * same booking returns null and the caller treats it as already done.
   */
  async createIfAbsent(
    client: PoolClient,
    p: {
      hostId: string;
      bookingId: string;
      amountMinor: number;
      currency: string;
      provider: PaymentProviderName;
    },
  ): Promise<Payout | null> {
    const res = await client.query<PayoutRow>(
      `INSERT INTO payouts (host_id, booking_id, amount_minor, currency, provider)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING ${COLS}`,
      [p.hostId, p.bookingId, p.amountMinor, p.currency, p.provider],
    );
    return res.rows[0] ? toPayout(res.rows[0]) : null;
  }

  async findById(id: string): Promise<Payout | null> {
    const res = await this.db.query<PayoutRow>(
      `SELECT ${COLS} FROM payouts WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? toPayout(res.rows[0]) : null;
  }

  async findByBooking(bookingId: string): Promise<Payout | null> {
    const res = await this.db.query<PayoutRow>(
      `SELECT ${COLS} FROM payouts WHERE booking_id = $1`,
      [bookingId],
    );
    return res.rows[0] ? toPayout(res.rows[0]) : null;
  }

  /** CAS PENDING -> IN_TRANSIT with the provider transfer reference. */
  async markInTransit(
    id: string,
    provider: PaymentProviderName,
    providerTransferId: string,
  ): Promise<Payout | null> {
    const res = await this.db.query<PayoutRow>(
      `UPDATE payouts
       SET status = 'IN_TRANSIT', provider = $2, provider_transfer_id = $3,
           initiated_at = now()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING ${COLS}`,
      [id, provider, providerTransferId],
    );
    return res.rows[0] ? toPayout(res.rows[0]) : null;
  }

  /** CAS IN_TRANSIT -> PAID inside the settlement transaction. */
  async markPaid(client: PoolClient, id: string): Promise<Payout | null> {
    const res = await client.query<PayoutRow>(
      `UPDATE payouts
       SET status = 'PAID', paid_at = now()
       WHERE id = $1 AND status = 'IN_TRANSIT'
       RETURNING ${COLS}`,
      [id],
    );
    return res.rows[0] ? toPayout(res.rows[0]) : null;
  }

  async markFailed(id: string, message: string): Promise<void> {
    await this.db.query(
      `UPDATE payouts
       SET status = 'FAILED', failure_message = $2
       WHERE id = $1 AND status IN ('PENDING', 'IN_TRANSIT')`,
      [id, message.slice(0, 1000)],
    );
  }
}

const toPayout = (r: PayoutRow): Payout => ({
  id: r.id,
  hostId: r.host_id,
  bookingId: r.booking_id,
  status: r.status,
  amountMinor: r.amount_minor,
  currency: r.currency,
  provider: r.provider,
  providerTransferId: r.provider_transfer_id,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});
