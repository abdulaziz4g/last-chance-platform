import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { PoolClient } from 'pg';
import {
  BookingNotFoundError,
  HoldExpiredError,
  StaleStateError,
  UnitUnavailableError,
  ValidationFailedError,
} from '../../../common/errors/domain-errors';
import { RedisLockService } from '../../../infrastructure/redis/redis-lock.service';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  BOOKING_EXPIRY_QUEUE,
  ExpireHoldJob,
  PAYMENTS_QUEUE,
  PaymentsJobData,
} from '../../../infrastructure/queue/queue.module';
import { SettingsService } from '../../settings/settings.service';
import { Booking, BookingSource, BookingType } from '../domain/types';
import { BookingFsmEngine } from './booking-fsm.engine';
import { PricingService } from './pricing.service';
import { BookingRepository } from '../infrastructure/booking.repository';
import { UnitRepository } from '../infrastructure/unit.repository';
import { BookingEventsPublisher } from '../events/booking-events.publisher';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'BookingService' });

/**
 * Optional flash-deal context. `claim` runs INSIDE the hold transaction,
 * after the availability check and before the insert, so the atomic inventory
 * decrement and the discounted booking commit or roll back together — a claim
 * can never leave a phantom counter increment behind, and a failed booking
 * (overlap) never burns a deal slot. DealService supplies the SQL; it must
 * throw a DomainError (e.g. FlashDealSoldOutError) when the deal is exhausted.
 */
export interface FlashDealContext {
  dealId: string;
  discountPct: number;
  claim: (client: PoolClient) => Promise<void>;
}

export interface CreateHoldCommand {
  guestId: string;
  unitId: string;
  bookingType: BookingType;
  checkInUtc: Date;
  checkOutUtc: Date;
  guestsCount: number;
  source?: BookingSource;
  flashDeal?: FlashDealContext;
}

/** TTL of the per-unit contention lock — covers ONLY the check+insert
 *  critical section, never the payment window (see RedisLockService docs). */
const UNIT_LOCK_TTL_MS = 5_000;

@Injectable()
export class BookingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locks: RedisLockService,
    private readonly fsm: BookingFsmEngine,
    private readonly pricing: PricingService,
    private readonly bookings: BookingRepository,
    private readonly units: UnitRepository,
    private readonly settings: SettingsService,
    private readonly events: BookingEventsPublisher,
    @Inject(BOOKING_EXPIRY_QUEUE)
    private readonly expiryQueue: Queue<ExpireHoldJob>,
    @Inject(PAYMENTS_QUEUE)
    private readonly paymentsQueue: Queue<PaymentsJobData>,
  ) {}

  /**
   * The critical write path: place a 10-minute payment hold.
   *
   * Layered defense (each layer can fail without breaking correctness):
   *   1. Redis per-unit lock — serializes the flash-deal herd (~ms hold).
   *   2. In-transaction availability pre-check — friendly 409 for the
   *      common conflict case.
   *   3. PostgreSQL exclusion constraint — THE guarantee; a race that slips
   *      past 1+2 still cannot commit (23P01 -> UnitUnavailableError).
   * The hold itself is the PENDING_PAYMENT row (durable), and its expiry is
   * a BullMQ delayed job + DB sweeper — never a long-lived lock.
   */
  async createHold(cmd: CreateHoldCommand): Promise<Booking> {
    if (cmd.checkOutUtc <= cmd.checkInUtc) {
      throw new ValidationFailedError('check_out must be after check_in');
    }
    if (cmd.checkInUtc.getTime() < Date.now()) {
      throw new ValidationFailedError('check_in must be in the future');
    }

    const unit = await this.units.findBookable(cmd.unitId);
    if (cmd.guestsCount < 1 || cmd.guestsCount > unit.maxGuests) {
      throw new ValidationFailedError(
        `guests_count must be between 1 and ${unit.maxGuests}`,
      );
    }

    const quote = this.pricing.quote(
      unit,
      cmd.bookingType,
      cmd.checkInUtc,
      cmd.checkOutUtc,
      { discountPct: cmd.flashDeal?.discountPct },
    );
    const holdExpiresAt = new Date(
      Date.now() + this.settings.holdMinutes * 60_000,
    );

    const booking = await this.locks.withLock(
      `lock:unit:${cmd.unitId}`,
      UNIT_LOCK_TTL_MS,
      () =>
        this.db.transaction(async (client) => {
          const conflict = await this.bookings.hasConflict(
            client,
            cmd.unitId,
            cmd.checkInUtc,
            cmd.checkOutUtc,
            unit.turnaroundMinutes,
          );
          if (conflict) {
            throw new UnitUnavailableError({ unitId: cmd.unitId });
          }
          // Atomic flash-deal claim, in-transaction: throws if sold out, and
          // rolls back with the booking if the insert below fails.
          if (cmd.flashDeal) {
            await cmd.flashDeal.claim(client);
          }
          return this.bookings.insertHold(client, {
            guestId: cmd.guestId,
            unitId: cmd.unitId,
            propertyId: unit.propertyId,
            bookingType: cmd.bookingType,
            source: cmd.source ?? 'API',
            checkInUtc: cmd.checkInUtc,
            checkOutUtc: cmd.checkOutUtc,
            turnaroundMinutes: unit.turnaroundMinutes,
            guestsCount: cmd.guestsCount,
            holdExpiresAt,
            quote,
            flashDealId: cmd.flashDeal?.dealId ?? null,
          });
        }),
    );

    // Post-commit side effects: neither may undo the committed hold.
    await this.scheduleExpiry(booking.id, holdExpiresAt);
    this.events.publish({
      type: 'HOLD_PLACED',
      unitId: booking.unitId,
      propertyId: booking.propertyId,
      bookingId: booking.id,
      checkInUtc: booking.checkInUtc.toISOString(),
      checkOutUtc: booking.checkOutUtc.toISOString(),
    });
    log.info(
      { bookingId: booking.id, unitId: booking.unitId, holdExpiresAt },
      'Payment hold placed',
    );
    return booking;
  }

  /**
   * Payment captured -> CONFIRMED. Invoked by the payment webhook pipeline
   * (Phase 3); paymentRef ties the transition to the PSP object for audit.
   */
  async confirm(bookingId: string, paymentRef: string): Promise<Booking> {
    const current = await this.mustFind(bookingId);
    this.fsm.assertTransition(current.status, 'CONFIRMED');

    const confirmed = await this.bookings.confirmHold(bookingId);
    if (!confirmed) {
      // CAS lost: the hold expired (sweeper won) or a concurrent transition.
      const now = await this.mustFind(bookingId);
      if (now.status === 'EXPIRED') throw new HoldExpiredError(bookingId);
      if (
        now.status === 'PENDING_PAYMENT' &&
        now.holdExpiresAt !== null &&
        now.holdExpiresAt.getTime() <= Date.now()
      ) {
        throw new HoldExpiredError(bookingId);
      }
      throw new StaleStateError(bookingId, now.status);
    }

    await this.cancelScheduledExpiry(bookingId);
    this.events.publish({
      type: 'BOOKING_CONFIRMED',
      unitId: confirmed.unitId,
      propertyId: confirmed.propertyId,
      bookingId: confirmed.id,
      checkInUtc: confirmed.checkInUtc.toISOString(),
      checkOutUtc: confirmed.checkOutUtc.toISOString(),
    });
    log.info({ bookingId, paymentRef }, 'Booking confirmed');
    return confirmed;
  }

  async cancel(
    bookingId: string,
    cancelledBy: 'GUEST' | 'HOST' | 'ADMIN' | 'SYSTEM',
    reason: string | null,
  ): Promise<Booking> {
    const current = await this.mustFind(bookingId);
    this.fsm.assertTransition(current.status, 'CANCELLED');

    const cancelled = await this.bookings.cancel(
      bookingId,
      current.status,
      cancelledBy,
      reason,
    );
    if (!cancelled) {
      const now = await this.mustFind(bookingId);
      throw new StaleStateError(bookingId, now.status);
    }

    await this.cancelScheduledExpiry(bookingId);
    // If money was captured, start the refund pipeline (no-op otherwise).
    await this.paymentsQueue.add('create-refund', {
      bookingId,
      reason: `cancelled_by_${cancelledBy.toLowerCase()}`,
    });
    this.events.publish({
      type: 'INVENTORY_RELEASED',
      unitId: cancelled.unitId,
      propertyId: cancelled.propertyId,
      bookingId: cancelled.id,
      checkInUtc: cancelled.checkInUtc.toISOString(),
      checkOutUtc: cancelled.checkOutUtc.toISOString(),
    });
    log.info({ bookingId, cancelledBy }, 'Booking cancelled');
    return cancelled;
  }

  async checkIn(bookingId: string): Promise<Booking> {
    return this.simpleTransition(bookingId, 'CHECKED_IN');
  }

  /** Checkout complete — releases inventory and triggers the escrow payout. */
  async complete(bookingId: string): Promise<Booking> {
    const booking = await this.simpleTransition(bookingId, 'COMPLETED');
    // Durable trigger for the escrow split + host transfer (payment module
    // worker). Queue coupling only — no module dependency.
    await this.paymentsQueue.add('create-payout', { bookingId });
    this.events.publish({
      type: 'INVENTORY_RELEASED',
      unitId: booking.unitId,
      propertyId: booking.propertyId,
      bookingId: booking.id,
      checkInUtc: booking.checkInUtc.toISOString(),
      checkOutUtc: booking.checkOutUtc.toISOString(),
    });
    return booking;
  }

  /** Money returned to the guest — CANCELLED -> REFUNDED (webhook-driven). */
  async markRefunded(bookingId: string): Promise<Booking> {
    const current = await this.mustFind(bookingId);
    this.fsm.assertTransition(current.status, 'REFUNDED');
    const updated = await this.bookings.transition(
      bookingId,
      current.status,
      'REFUNDED',
    );
    if (!updated) {
      const now = await this.mustFind(bookingId);
      throw new StaleStateError(bookingId, now.status);
    }
    log.info({ bookingId }, 'Booking marked refunded');
    return updated;
  }

  /** Called by the BullMQ delayed job; idempotent by construction. */
  async expireHold(bookingId: string): Promise<boolean> {
    const expired = await this.bookings.expireIfLapsed(bookingId);
    if (!expired) return false; // paid in time, already expired, or not lapsed

    this.events.publish({
      type: 'INVENTORY_RELEASED',
      unitId: expired.unitId,
      propertyId: expired.propertyId,
      bookingId: expired.id,
      checkInUtc: expired.checkInUtc.toISOString(),
      checkOutUtc: expired.checkOutUtc.toISOString(),
    });
    log.info({ bookingId }, 'Payment hold expired; inventory released');
    return true;
  }

  async getById(bookingId: string): Promise<Booking> {
    return this.mustFind(bookingId);
  }

  async listByGuest(guestId: string, limit = 50): Promise<Booking[]> {
    return this.bookings.listByGuest(guestId, limit);
  }

  private async simpleTransition(
    bookingId: string,
    to: 'CHECKED_IN' | 'COMPLETED',
  ): Promise<Booking> {
    const current = await this.mustFind(bookingId);
    this.fsm.assertTransition(current.status, to);

    const updated = await this.bookings.transition(
      bookingId,
      current.status,
      to,
    );
    if (!updated) {
      const now = await this.mustFind(bookingId);
      throw new StaleStateError(bookingId, now.status);
    }
    log.info({ bookingId, to }, 'Booking transitioned');
    return updated;
  }

  private async mustFind(bookingId: string): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw new BookingNotFoundError(bookingId);
    return booking;
  }

  private async scheduleExpiry(
    bookingId: string,
    holdExpiresAt: Date,
  ): Promise<void> {
    // jobId makes scheduling idempotent; +2s grace lets the DB clock win.
    // If the queue is briefly down the DB sweeper still expires the hold —
    // never fail a placed hold over its cleanup timer.
    try {
      await this.expiryQueue.add(
        'expire',
        { bookingId },
        {
          delay: Math.max(0, holdExpiresAt.getTime() - Date.now()) + 2_000,
          // BullMQ forbids ':' in custom job ids (its own key delimiter).
          jobId: `expire-${bookingId}`,
        },
      );
    } catch (err) {
      log.error({ err, bookingId }, 'Failed to schedule expiry job (sweeper will cover)');
    }
  }

  private async cancelScheduledExpiry(bookingId: string): Promise<void> {
    // Best-effort: an orphaned job is harmless (expireIfLapsed is a no-op
    // on non-pending bookings).
    try {
      const job = await this.expiryQueue.getJob(`expire-${bookingId}`);
      await job?.remove();
    } catch {
      /* job already ran or was removed */
    }
  }
}
