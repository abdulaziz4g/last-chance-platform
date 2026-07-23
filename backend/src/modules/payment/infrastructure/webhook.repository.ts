import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { PaymentProviderName, WebhookEventRecord } from '../domain/types';

interface EventRow {
  id: string;
  provider: PaymentProviderName;
  event_id: string;
  event_type: string;
  payload: unknown;
  signature_valid: boolean;
  processing_status: WebhookEventRecord['processingStatus'];
  attempts: number;
}

const COLS = `id, provider, event_id, event_type, payload, signature_valid,
              processing_status, attempts`;

/**
 * The idempotent webhook inbox (db 0007). UNIQUE (provider, event_id) makes
 * redelivery a no-op at the door; processing state lives on the row so a
 * crashed worker resumes instead of double-applying.
 */
@Injectable()
export class WebhookRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Returns null when this event id was already recorded (duplicate). */
  async record(p: {
    provider: PaymentProviderName;
    eventId: string;
    eventType: string;
    payload: unknown;
    signatureValid: boolean;
    initialStatus: 'RECEIVED' | 'SKIPPED';
  }): Promise<WebhookEventRecord | null> {
    const res = await this.db.query<EventRow>(
      `INSERT INTO payment_webhook_events
         (provider, event_id, event_type, payload, signature_valid, processing_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING ${COLS}`,
      [
        p.provider,
        p.eventId,
        p.eventType,
        JSON.stringify(p.payload),
        p.signatureValid,
        p.initialStatus,
      ],
    );
    return res.rows[0] ? toRecord(res.rows[0]) : null;
  }

  /** CAS claim for processing — only one worker wins a given event. */
  async claimForProcessing(id: string): Promise<WebhookEventRecord | null> {
    const res = await this.db.query<EventRow>(
      `UPDATE payment_webhook_events
       SET processing_status = 'PROCESSING', attempts = attempts + 1
       WHERE id = $1 AND processing_status IN ('RECEIVED', 'FAILED')
       RETURNING ${COLS}`,
      [id],
    );
    return res.rows[0] ? toRecord(res.rows[0]) : null;
  }

  async markProcessed(id: string): Promise<void> {
    await this.db.query(
      `UPDATE payment_webhook_events
       SET processing_status = 'PROCESSED', processed_at = now(), last_error = NULL
       WHERE id = $1`,
      [id],
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE payment_webhook_events
       SET processing_status = 'FAILED', last_error = $2
       WHERE id = $1`,
      [id, error.slice(0, 2000)],
    );
  }

  async markSkipped(id: string): Promise<void> {
    await this.db.query(
      `UPDATE payment_webhook_events
       SET processing_status = 'SKIPPED', processed_at = now()
       WHERE id = $1`,
      [id],
    );
  }
}

const toRecord = (r: EventRow): WebhookEventRecord => ({
  id: r.id,
  provider: r.provider,
  eventId: r.event_id,
  eventType: r.event_type,
  payload: r.payload,
  signatureValid: r.signature_valid,
  processingStatus: r.processing_status,
  attempts: r.attempts,
});
