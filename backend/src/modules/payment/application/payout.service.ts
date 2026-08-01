import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../../config/config.service';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  PAYMENTS_QUEUE,
  PaymentsJobData,
} from '../../../infrastructure/queue/queue.module';
import { BookingService } from '../../booking/application/booking.service';
import { Payout } from '../domain/types';
import { LedgerService } from '../infrastructure/ledger.service';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { PayoutRepository } from '../infrastructure/payout.repository';
import { PaymentProviderRegistry } from '../providers/provider.registry';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'PayoutService' });

/**
 * Escrow release. Checkout (booking COMPLETED) triggers two steps:
 *
 *   1. createForBooking — the SPLIT: escrow is emptied into host payable,
 *      platform revenue, and tax payable, and the payout row is created.
 *      UNIQUE(booking_id) + one transaction = a stay can never pay out twice.
 *   2. executePayout — the TRANSFER: provider moves host money; the ledger
 *      moves HOST_PAYABLE -> PROVIDER_CLEARING when it settles.
 */
@Injectable()
export class PayoutService {
  constructor(
    private readonly db: DatabaseService,
    private readonly payouts: PayoutRepository,
    private readonly payments: PaymentRepository,
    private readonly ledger: LedgerService,
    private readonly registry: PaymentProviderRegistry,
    private readonly bookings: BookingService,
    private readonly config: AppConfigService,
    @Inject(PAYMENTS_QUEUE) private readonly queue: Queue<PaymentsJobData>,
  ) {}

  async createForBooking(bookingId: string): Promise<Payout | null> {
    const booking = await this.bookings.getById(bookingId);
    if (booking.status !== 'COMPLETED') {
      log.warn(
        { bookingId, status: booking.status },
        'Payout requested for non-completed booking — skipping',
      );
      return null;
    }

    const payment = await this.payments.findCapturedForBooking(bookingId);
    if (!payment) {
      log.error({ bookingId }, 'Completed booking has no captured payment');
      return null;
    }

    const host = await this.db.query<{ host_id: string }>(
      `SELECT p.host_id FROM properties p WHERE p.id = $1`,
      [booking.propertyId],
    );
    const hostId = host.rows[0]?.host_id;
    if (!hostId) return null;

    // THE SPLIT, and the one place a discount is easy to double-count.
    //
    // PricingService derives commission, service fee, VAT and host payout from
    // the NET base (base - discount), so every figure on the booking row is
    // already post-discount. Subtracting discountMinor again here would take it
    // off twice: the credit legs then fall short of the escrow debit by exactly
    // the discount, and for any real deal the revenue leg goes NEGATIVE, which
    // the money_minor domain rejects outright. Either way the payout
    // transaction rolls back and the stay can never settle.
    //
    // The legs below sum to the total by construction:
    //   hostPayout + commission = base - discount            (bookings_split_exact, 0015)
    //   + cleaning + serviceFee + taxes                      = totalAmountMinor
    const hostShareMinor = booking.hostPayoutMinor + booking.cleaningFeeMinor;
    const revenueMinor = booking.commissionMinor + booking.serviceFeeMinor;

    const payout = await this.db.transaction(async (client) => {
      const created = await this.payouts.createIfAbsent(client, {
        hostId,
        bookingId,
        amountMinor: hostShareMinor,
        currency: booking.currency,
        provider: payment.provider,
      });
      if (!created) return null; // double-payout guard fired

      // THE SPLIT: escrow -> payable/revenue/tax. Balances to the total.
      await this.ledger.postGroup(client, booking.currency, [
        {
          account: 'PLATFORM_ESCROW',
          direction: 'DEBIT',
          amountMinor: booking.totalAmountMinor,
          bookingId,
          paymentId: payment.id,
          description: `Escrow release for completed stay ${booking.bookingCode}`,
        },
        {
          account: 'HOST_PAYABLE',
          direction: 'CREDIT',
          amountMinor: hostShareMinor,
          bookingId,
          payoutId: created.id,
          hostId,
          description: `Host earnings ${booking.bookingCode}`,
        },
        {
          account: 'PLATFORM_REVENUE',
          direction: 'CREDIT',
          amountMinor: revenueMinor,
          bookingId,
          description: `Commission + service fee ${booking.bookingCode}`,
        },
        {
          account: 'TAX_PAYABLE',
          direction: 'CREDIT',
          amountMinor: booking.taxesMinor,
          bookingId,
          description: `VAT collected ${booking.bookingCode}`,
        },
      ]);
      return created;
    });

    if (payout) {
      await this.queue.add(
        'execute-payout',
        { payoutId: payout.id },
        { delay: this.config.payoutExecuteDelayMs },
      );
      log.info(
        { payoutId: payout.id, bookingId, amountMinor: hostShareMinor },
        'Payout created and scheduled',
      );
    }
    return payout ?? (await this.payouts.findByBooking(bookingId));
  }

  async executePayout(payoutId: string): Promise<void> {
    const payout = await this.payouts.findById(payoutId);
    if (!payout || payout.status !== 'PENDING') return; // idempotent

    const hostRef = await this.db.query<{ payout_provider_ref: string | null }>(
      `SELECT payout_provider_ref FROM host_profiles WHERE user_id = $1`,
      [payout.hostId],
    );

    const provider = this.registry.get(payout.provider ?? 'MOCK');
    try {
      const transfer = await provider.createTransfer({
        payoutId: payout.id,
        hostPayoutRef: hostRef.rows[0]?.payout_provider_ref ?? null,
        amountMinor: payout.amountMinor,
        currency: payout.currency,
      });
      const moving = await this.payouts.markInTransit(
        payout.id,
        provider.name,
        transfer.providerTransferId,
      );
      if (!moving) return; // lost the CAS — someone else is executing

      // Real providers settle via their payout webhook; the MOCK provider
      // settles synchronously so dev/test sees the full ledger cycle.
      if (provider.name === 'MOCK') {
        await this.settle(payout.id);
      }
    } catch (err) {
      await this.payouts.markFailed(payout.id, String(err));
      throw err; // BullMQ retries with backoff
    }
  }

  /** Transfer settled: payout -> PAID + ledger HOST_PAYABLE -> clearing. */
  async settle(payoutId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      const paid = await this.payouts.markPaid(client, payoutId);
      if (!paid) return; // already settled

      await this.ledger.postGroup(client, paid.currency, [
        {
          account: 'HOST_PAYABLE',
          direction: 'DEBIT',
          amountMinor: paid.amountMinor,
          bookingId: paid.bookingId,
          payoutId: paid.id,
          hostId: paid.hostId,
          description: `Payout ${paid.providerTransferId ?? paid.id} settled`,
        },
        {
          account: 'PROVIDER_CLEARING',
          direction: 'CREDIT',
          amountMinor: paid.amountMinor,
          bookingId: paid.bookingId,
          payoutId: paid.id,
          description: `Transfer to host bank via provider`,
        },
      ]);
      log.info({ payoutId }, 'Payout settled and ledgered');
    });
  }

  async getByBooking(bookingId: string): Promise<Payout | null> {
    return this.payouts.findByBooking(bookingId);
  }
}
