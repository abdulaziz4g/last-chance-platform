import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  HoldExpiredError,
  InvalidTransitionError,
} from '../../../common/errors/domain-errors';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  PAYMENTS_QUEUE,
  PaymentsJobData,
} from '../../../infrastructure/queue/queue.module';
import { BookingService } from '../../booking/application/booking.service';
import { PaymentProviderName, WebhookEventRecord } from '../domain/types';
import { LedgerService } from '../infrastructure/ledger.service';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { WebhookRepository } from '../infrastructure/webhook.repository';
import { PaymentProviderRegistry } from '../providers/provider.registry';
import { NormalizedWebhookEvent } from '../providers/payment-provider.interface';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'WebhookService' });

export interface WebhookIntakeResult {
  accepted: boolean;
  duplicate: boolean;
}

/**
 * The webhook pipeline, split in two for resilience:
 *
 *   INTAKE (http, must answer < 1s or providers start retrying):
 *     verify signature on the RAW body -> record in the idempotent inbox
 *     (UNIQUE provider+event_id) -> enqueue -> 200.
 *
 *   PROCESSING (BullMQ worker, retried with backoff):
 *     claim the event row (CAS) -> apply the state change + ledger posting
 *     in ONE transaction -> mark processed. Every branch is idempotent, so
 *     a redelivered or re-run event can never double-apply money.
 */
@Injectable()
export class WebhookService {
  constructor(
    private readonly db: DatabaseService,
    private readonly webhooks: WebhookRepository,
    private readonly payments: PaymentRepository,
    private readonly ledger: LedgerService,
    private readonly registry: PaymentProviderRegistry,
    private readonly bookings: BookingService,
    @Inject(PAYMENTS_QUEUE) private readonly queue: Queue<PaymentsJobData>,
  ) {}

  // ---- intake --------------------------------------------------------------

  async intake(
    providerName: PaymentProviderName,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookIntakeResult> {
    const provider = this.registry.get(providerName);
    const signatureValid = provider.verifySignature(rawBody, headers);

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      payload = { unparseable: rawBody.toString('utf8').slice(0, 1000) };
    }
    const normalized = provider.parseEvent(payload);

    const record = await this.webhooks.record({
      provider: providerName,
      eventId: normalized.eventId,
      eventType: normalized.eventType,
      payload,
      signatureValid,
      initialStatus: signatureValid ? 'RECEIVED' : 'SKIPPED',
    });

    if (!signatureValid) {
      log.warn(
        { provider: providerName, eventId: normalized.eventId },
        'Webhook with INVALID signature recorded and skipped',
      );
      return { accepted: false, duplicate: false };
    }
    if (!record) {
      return { accepted: true, duplicate: true }; // idempotent redelivery
    }

    await this.queue.add('process-webhook', { eventRecordId: record.id });
    return { accepted: true, duplicate: false };
  }

  // ---- processing (invoked by the payments worker) ---------------------------

  async process(eventRecordId: string): Promise<void> {
    const record = await this.webhooks.claimForProcessing(eventRecordId);
    if (!record) return; // processed elsewhere or unknown

    try {
      const provider = this.registry.get(record.provider);
      const event = provider.parseEvent(record.payload);

      switch (event.type) {
        case 'PAYMENT_CAPTURED':
          await this.applyCapture(record, event);
          break;
        case 'PAYMENT_FAILED':
          await this.applyFailure(record, event);
          break;
        case 'REFUND_SUCCEEDED':
          await this.applyRefund(record, event);
          break;
        case 'REFUND_FAILED':
          log.warn({ event }, 'Refund failed at provider — manual follow-up');
          await this.webhooks.markProcessed(record.id);
          break;
        case 'IGNORED':
          await this.webhooks.markSkipped(record.id);
          break;
      }
    } catch (err) {
      await this.webhooks.markFailed(record.id, String(err));
      throw err; // let BullMQ retry with backoff
    }
  }

  /**
   * Capture: payment -> CAPTURED + escrow ledger entry in one transaction,
   * then booking -> CONFIRMED (its own CAS; safe to repeat on retries).
   */
  private async applyCapture(
    record: WebhookEventRecord,
    event: NormalizedWebhookEvent,
  ): Promise<void> {
    if (!event.providerPaymentId) {
      throw new Error('Capture event without providerPaymentId');
    }

    const bookingId = await this.db.transaction(async (client) => {
      const payment = await this.payments.findByProviderRef(
        client,
        record.provider,
        event.providerPaymentId!,
      );
      if (!payment) {
        throw new Error(
          `No payment for ${record.provider}/${event.providerPaymentId}`,
        );
      }
      if (
        event.amountMinor !== undefined &&
        event.amountMinor !== payment.amountMinor
      ) {
        throw new Error(
          `Amount mismatch: provider says ${event.amountMinor}, we expect ${payment.amountMinor}`,
        );
      }

      const captured = await this.payments.markCaptured(client, payment.id);
      if (captured) {
        // Money entered escrow — account for it atomically with the capture.
        await this.ledger.postGroup(client, payment.currency, [
          {
            account: 'PROVIDER_CLEARING',
            direction: 'DEBIT',
            amountMinor: payment.amountMinor,
            bookingId: payment.bookingId,
            paymentId: payment.id,
            description: `Capture ${record.provider}/${event.providerPaymentId}`,
          },
          {
            account: 'PLATFORM_ESCROW',
            direction: 'CREDIT',
            amountMinor: payment.amountMinor,
            bookingId: payment.bookingId,
            paymentId: payment.id,
            description: `Escrow hold for booking ${payment.bookingId}`,
          },
        ]);
      }
      // captured === null -> already captured earlier (redelivery): fall
      // through and still reconcile the booking below.
      return payment.bookingId;
    });

    await this.confirmBookingIdempotent(bookingId);
    await this.webhooks.markProcessed(record.id);
  }

  private async confirmBookingIdempotent(bookingId: string): Promise<void> {
    const booking = await this.bookings.getById(bookingId);
    if (booking.status !== 'PENDING_PAYMENT') return; // already reconciled

    try {
      await this.bookings.confirm(bookingId, 'webhook-capture');
    } catch (err) {
      if (err instanceof HoldExpiredError) {
        // Money captured but the hold lapsed: auto-refund, guest re-books.
        log.warn({ bookingId }, 'Capture after hold expiry — auto-refunding');
        await this.queue.add('create-refund', {
          bookingId,
          reason: 'hold_expired_after_capture',
        });
        return;
      }
      if (err instanceof InvalidTransitionError) return; // concurrent confirm
      throw err;
    }
  }

  private async applyFailure(
    record: WebhookEventRecord,
    event: NormalizedWebhookEvent,
  ): Promise<void> {
    if (!event.providerPaymentId) {
      throw new Error('Failure event without providerPaymentId');
    }
    await this.db.transaction(async (client) => {
      const payment = await this.payments.findByProviderRef(
        client,
        record.provider,
        event.providerPaymentId!,
      );
      if (!payment) return; // unknown intent — nothing to do
      await this.payments.markFailed(
        client,
        payment.id,
        event.failureCode ?? null,
        event.failureMessage ?? null,
      );
    });
    // Booking stays PENDING_PAYMENT: the guest may retry until the hold
    // lapses, then the expiry pipeline releases the inventory.
    await this.webhooks.markProcessed(record.id);
  }

  private async applyRefund(
    record: WebhookEventRecord,
    event: NormalizedWebhookEvent,
  ): Promise<void> {
    if (!event.providerPaymentId || !event.providerRefundId) {
      throw new Error('Refund event missing provider references');
    }

    const bookingId = await this.db.transaction(async (client) => {
      const payment = await this.payments.findByProviderRef(
        client,
        record.provider,
        event.providerPaymentId!,
      );
      if (!payment) throw new Error('Refund for unknown payment');

      const settled = await this.payments.settleRefund(
        client,
        payment.id,
        event.providerRefundId!,
      );
      if (settled) {
        await this.ledger.postGroup(client, payment.currency, [
          {
            account: 'PLATFORM_ESCROW',
            direction: 'DEBIT',
            amountMinor: settled.refundAmountMinor,
            bookingId: payment.bookingId,
            paymentId: payment.id,
            description: `Refund release ${event.providerRefundId}`,
          },
          {
            account: 'GUEST_REFUND_CLEARING',
            direction: 'CREDIT',
            amountMinor: settled.refundAmountMinor,
            bookingId: payment.bookingId,
            paymentId: payment.id,
            description: `Refund to guest ${event.providerRefundId}`,
          },
        ]);
      }
      return payment.bookingId;
    });

    // Cancelled bookings advance CANCELLED -> REFUNDED once money moved back.
    const booking = await this.bookings.getById(bookingId);
    if (booking.status === 'CANCELLED') {
      await this.bookings.markRefunded(bookingId);
    }
    await this.webhooks.markProcessed(record.id);
  }
}
