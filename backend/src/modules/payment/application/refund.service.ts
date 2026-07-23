import { Injectable } from '@nestjs/common';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { PaymentProviderRegistry } from '../providers/provider.registry';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'RefundService' });

/**
 * Refund initiation (booking cancelled, or capture landed after hold expiry).
 * v1 policy: full refund of the un-refunded remainder. Percentage-based
 * cancellation policies plug in here (Phase 4 exposes host policy config).
 *
 * The refund COMPLETES via the provider's REFUND_SUCCEEDED webhook
 * (webhook.service), which settles the row, the payment counters, the
 * ledger, and the booking's CANCELLED -> REFUNDED transition.
 */
@Injectable()
export class RefundService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  async createForBooking(bookingId: string, reason: string): Promise<void> {
    const payment = await this.payments.findCapturedForBooking(bookingId);
    if (!payment || !payment.providerPaymentId) {
      log.info({ bookingId }, 'No captured payment — nothing to refund');
      return;
    }
    if (await this.payments.hasPendingOrDoneRefund(payment.id)) {
      log.info({ bookingId, paymentId: payment.id }, 'Refund already exists');
      return;
    }

    const remainingMinor = payment.amountMinor - payment.refundedAmountMinor;
    if (remainingMinor <= 0) return;

    const refund = await this.payments.createRefund({
      paymentId: payment.id,
      amountMinor: remainingMinor,
      currency: payment.currency,
      reason,
      initiatedBy: 'SYSTEM',
    });

    const provider = this.registry.get(payment.provider);
    const created = await provider.createRefund({
      providerPaymentId: payment.providerPaymentId,
      amountMinor: remainingMinor,
      currency: payment.currency,
      idempotencyKey: `refund-${refund.id}`,
    });
    await this.payments.attachProviderRefund(refund.id, created.providerRefundId);

    log.info(
      { bookingId, refundId: refund.id, providerRefundId: created.providerRefundId },
      'Refund initiated at provider — awaiting webhook settlement',
    );
  }
}
