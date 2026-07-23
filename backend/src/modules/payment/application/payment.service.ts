import { Injectable } from '@nestjs/common';
import {
  HoldExpiredError,
  ValidationFailedError,
} from '../../../common/errors/domain-errors';
import { BookingService } from '../../booking/application/booking.service';
import { Payment, PaymentMethod, PaymentProviderName } from '../domain/types';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { PaymentProviderRegistry } from '../providers/provider.registry';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'PaymentService' });

export interface InitiatePaymentResult {
  payment: Payment;
  /** Provider handoff for the client (client_secret, redirect…). Present on
   *  the attempt that created/attached the provider intent. */
  clientAction: Record<string, unknown> | null;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly registry: PaymentProviderRegistry,
    private readonly bookings: BookingService,
  ) {}

  /**
   * Start payment for a held booking. Idempotent end to end:
   *   - our row: INSERT ON CONFLICT on the idempotency key
   *   - provider intent: the same key is forwarded as the provider
   *     Idempotency-Key, so a crash-retry cannot double-charge.
   * A retry after a crashed provider call finds the INITIATED row without a
   * provider id and completes the intent attach — never a second intent.
   */
  async initiate(p: {
    bookingId: string;
    provider: PaymentProviderName;
    method: PaymentMethod;
    idempotencyKey?: string;
  }): Promise<InitiatePaymentResult> {
    const booking = await this.bookings.getById(p.bookingId);
    if (booking.status !== 'PENDING_PAYMENT') {
      throw new ValidationFailedError(
        `Booking is not awaiting payment (status ${booking.status})`,
        { bookingId: p.bookingId, status: booking.status },
      );
    }
    if (
      booking.holdExpiresAt === null ||
      booking.holdExpiresAt.getTime() <= Date.now()
    ) {
      throw new HoldExpiredError(p.bookingId);
    }

    const provider = this.registry.get(p.provider);
    const idempotencyKey =
      p.idempotencyKey ?? `init-${p.bookingId}-${p.provider}`;

    const { payment, created } = await this.payments.createIdempotent({
      bookingId: p.bookingId,
      provider: p.provider,
      method: p.method,
      idempotencyKey,
      amountMinor: booking.totalAmountMinor,
      currency: booking.currency,
    });

    // Fresh row, or a prior attempt that crashed before the intent attached.
    if (created || (payment.status === 'INITIATED' && !payment.providerPaymentId)) {
      const intent = await provider.createIntent({
        paymentId: payment.id,
        bookingCode: booking.bookingCode,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        method: p.method,
        idempotencyKey,
      });
      const attached = await this.payments.attachProviderIntent(
        payment.id,
        intent.providerPaymentId,
      );
      log.info(
        { paymentId: payment.id, provider: p.provider, bookingId: p.bookingId },
        'Payment intent created',
      );
      return { payment: attached ?? payment, clientAction: intent.clientAction };
    }

    // Idempotent replay of a live attempt: return state; the client re-fetches
    // its provider action from the provider using the stored intent id.
    return { payment, clientAction: null };
  }

  async getById(paymentId: string): Promise<Payment> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new ValidationFailedError('Payment not found', { paymentId });
    }
    return payment;
  }
}
