import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  Payment,
  PaymentMethod,
  PaymentProviderName,
  PaymentStatus,
  Refund,
} from '../domain/types';

interface PaymentRow {
  id: string;
  booking_id: string;
  provider: PaymentProviderName;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotency_key: string;
  provider_payment_id: string | null;
  amount_minor: number;
  currency: string;
  refunded_amount_minor: number;
  captured_at: Date | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLS = `
  id, booking_id, provider, method, status, idempotency_key,
  provider_payment_id, amount_minor, currency, refunded_amount_minor,
  captured_at, failure_code, failure_message, created_at, updated_at`;

@Injectable()
export class PaymentRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Idempotent create: same idempotency key returns the same payment row.
   * Retry-safe by construction (INSERT ... ON CONFLICT DO NOTHING + fetch).
   */
  async createIdempotent(p: {
    bookingId: string;
    provider: PaymentProviderName;
    method: PaymentMethod;
    idempotencyKey: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ payment: Payment; created: boolean }> {
    const inserted = await this.db.query<PaymentRow>(
      `INSERT INTO payments
         (booking_id, provider, method, idempotency_key, amount_minor, currency)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING ${COLS}`,
      [p.bookingId, p.provider, p.method, p.idempotencyKey, p.amountMinor, p.currency],
    );
    if (inserted.rows[0]) {
      return { payment: toPayment(inserted.rows[0]), created: true };
    }
    const existing = await this.db.query<PaymentRow>(
      `SELECT ${COLS} FROM payments WHERE idempotency_key = $1`,
      [p.idempotencyKey],
    );
    return { payment: toPayment(existing.rows[0]), created: false };
  }

  async attachProviderIntent(
    id: string,
    providerPaymentId: string,
  ): Promise<Payment | null> {
    const res = await this.db.query<PaymentRow>(
      `UPDATE payments
       SET provider_payment_id = $2, status = 'REQUIRES_ACTION'
       WHERE id = $1 AND status = 'INITIATED'
       RETURNING ${COLS}`,
      [id, providerPaymentId],
    );
    return res.rows[0] ? toPayment(res.rows[0]) : null;
  }

  async findById(id: string): Promise<Payment | null> {
    const res = await this.db.query<PaymentRow>(
      `SELECT ${COLS} FROM payments WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? toPayment(res.rows[0]) : null;
  }

  async findByProviderRef(
    client: PoolClient,
    provider: PaymentProviderName,
    providerPaymentId: string,
  ): Promise<Payment | null> {
    const res = await client.query<PaymentRow>(
      `SELECT ${COLS} FROM payments
       WHERE provider = $1 AND provider_payment_id = $2
       FOR UPDATE`,
      [provider, providerPaymentId],
    );
    return res.rows[0] ? toPayment(res.rows[0]) : null;
  }

  /** Latest capturable/captured payment for a booking (refund path). */
  async findCapturedForBooking(bookingId: string): Promise<Payment | null> {
    const res = await this.db.query<PaymentRow>(
      `SELECT ${COLS} FROM payments
       WHERE booking_id = $1 AND status IN ('CAPTURED', 'PARTIALLY_REFUNDED')
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId],
    );
    return res.rows[0] ? toPayment(res.rows[0]) : null;
  }

  /** CAS capture inside the webhook-processing transaction. */
  async markCaptured(client: PoolClient, id: string): Promise<Payment | null> {
    const res = await client.query<PaymentRow>(
      `UPDATE payments
       SET status = 'CAPTURED', captured_at = now()
       WHERE id = $1 AND status IN ('INITIATED', 'REQUIRES_ACTION', 'AUTHORIZED')
       RETURNING ${COLS}`,
      [id],
    );
    return res.rows[0] ? toPayment(res.rows[0]) : null;
  }

  async markFailed(
    client: PoolClient,
    id: string,
    failureCode: string | null,
    failureMessage: string | null,
  ): Promise<void> {
    await client.query(
      `UPDATE payments
       SET status = 'FAILED', failed_at = now(), failure_code = $2, failure_message = $3
       WHERE id = $1 AND status IN ('INITIATED', 'REQUIRES_ACTION', 'AUTHORIZED')`,
      [id, failureCode, failureMessage],
    );
  }

  // ---- refunds -------------------------------------------------------------

  async createRefund(p: {
    paymentId: string;
    amountMinor: number;
    currency: string;
    reason: string | null;
    initiatedBy: string;
  }): Promise<Refund> {
    const res = await this.db.query<{
      id: string;
      payment_id: string;
      provider_refund_id: string | null;
      status: Refund['status'];
      amount_minor: number;
      currency: string;
      reason: string | null;
      created_at: Date;
    }>(
      `INSERT INTO refunds (payment_id, amount_minor, currency, reason, initiated_by)
       VALUES ($1, $2, $3, $4, $5::actor_type)
       RETURNING id, payment_id, provider_refund_id, status, amount_minor,
                 currency, reason, created_at`,
      [p.paymentId, p.amountMinor, p.currency, p.reason, p.initiatedBy],
    );
    const r = res.rows[0];
    return {
      id: r.id,
      paymentId: r.payment_id,
      providerRefundId: r.provider_refund_id,
      status: r.status,
      amountMinor: r.amount_minor,
      currency: r.currency,
      reason: r.reason,
      createdAt: r.created_at,
    };
  }

  async attachProviderRefund(id: string, providerRefundId: string): Promise<void> {
    await this.db.query(
      `UPDATE refunds SET provider_refund_id = $2 WHERE id = $1`,
      [id, providerRefundId],
    );
  }

  async hasPendingOrDoneRefund(paymentId: string): Promise<boolean> {
    const res = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM refunds
         WHERE payment_id = $1 AND status IN ('PENDING', 'SUCCEEDED')
       ) AS exists`,
      [paymentId],
    );
    return res.rows[0]?.exists ?? false;
  }

  /**
   * Settle a refund inside the webhook transaction: refund row -> SUCCEEDED,
   * payment counters updated, status derived (REFUNDED vs PARTIALLY_REFUNDED).
   */
  async settleRefund(
    client: PoolClient,
    paymentId: string,
    providerRefundId: string,
  ): Promise<{ refundAmountMinor: number } | null> {
    const refund = await client.query<{ id: string; amount_minor: number }>(
      `UPDATE refunds SET status = 'SUCCEEDED'
       WHERE payment_id = $1 AND provider_refund_id = $2 AND status = 'PENDING'
       RETURNING id, amount_minor`,
      [paymentId, providerRefundId],
    );
    const row = refund.rows[0];
    if (!row) return null; // already settled (duplicate webhook) or unknown

    await client.query(
      `UPDATE payments
       SET refunded_amount_minor = refunded_amount_minor + $2,
           status = CASE
             WHEN refunded_amount_minor + $2 >= amount_minor THEN 'REFUNDED'::payment_status
             ELSE 'PARTIALLY_REFUNDED'::payment_status
           END
       WHERE id = $1`,
      [paymentId, row.amount_minor],
    );
    return { refundAmountMinor: row.amount_minor };
  }
}

const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  bookingId: r.booking_id,
  provider: r.provider,
  method: r.method,
  status: r.status,
  idempotencyKey: r.idempotency_key,
  providerPaymentId: r.provider_payment_id,
  amountMinor: r.amount_minor,
  currency: r.currency,
  refundedAmountMinor: r.refunded_amount_minor,
  capturedAt: r.captured_at,
  failureCode: r.failure_code,
  failureMessage: r.failure_message,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
