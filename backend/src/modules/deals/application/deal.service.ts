import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  FlashDealNotClaimableError,
  FlashDealNotFoundError,
  FlashDealSoldOutError,
  ValidationFailedError,
} from '../../../common/errors/domain-errors';
import {
  Booking,
  BookingType,
} from '../../booking/domain/types';
import { BookingService } from '../../booking/application/booking.service';
import { DealRepository } from '../infrastructure/deal.repository';
import { DealEventsPublisher } from '../events/deal-events.publisher';
import {
  CreateDealInput,
  FlashDeal,
  FlashDealView,
} from '../domain/types';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'DealService' });

const MAX_DEAL_HOURS = 72; // mirrors the DB deals_max_duration CHECK

export interface ClaimDealCommand {
  dealId: string;
  guestId: string;
  bookingType: BookingType;
  checkInUtc: Date;
  checkOutUtc: Date;
  guestsCount: number;
}

@Injectable()
export class DealService {
  constructor(
    private readonly deals: DealRepository,
    private readonly bookings: BookingService,
    private readonly events: DealEventsPublisher,
  ) {}

  async create(input: CreateDealInput): Promise<FlashDeal> {
    if (input.endsAt <= input.startsAt) {
      throw new ValidationFailedError('endsAt must be after startsAt');
    }
    if (input.endsAt.getTime() - input.startsAt.getTime() > MAX_DEAL_HOURS * 3_600_000) {
      throw new ValidationFailedError(`A flash deal may not run longer than ${MAX_DEAL_HOURS}h`);
    }
    if (input.discountPct < 5 || input.discountPct > 90) {
      throw new ValidationFailedError('discountPct must be between 5 and 90');
    }
    if (input.quantityTotal < 1) {
      throw new ValidationFailedError('quantityTotal must be at least 1');
    }

    const deal = await this.deals.create(input);
    if (deal.status === 'ACTIVE') {
      this.events.publish({
        type: 'DEAL_ACTIVATED',
        dealId: deal.id,
        unitId: deal.unitId,
        quantityRemaining: deal.quantityTotal - deal.quantityClaimed,
      });
    }
    log.info({ dealId: deal.id, unitId: deal.unitId, status: deal.status }, 'Flash deal created');
    return deal;
  }

  listActive(limit = 50): Promise<FlashDealView[]> {
    return this.deals.listActive(limit);
  }

  /**
   * Claim a flash deal = place a discounted hold on its unit, decrementing
   * the deal's inventory ATOMICALLY in the same transaction as the booking
   * (see BookingService.createHold's flashDeal hook). Validation here is a
   * fast pre-check for friendly errors; the atomic UPDATE inside the tx is
   * the real gate against over-claiming.
   */
  async claim(cmd: ClaimDealCommand): Promise<Booking> {
    const deal = await this.deals.findById(cmd.dealId);
    if (!deal) throw new FlashDealNotFoundError(cmd.dealId);

    const now = Date.now();
    // Exhausted inventory (or the auto-flipped SOLD_OUT status) is a distinct,
    // more specific signal than a generic "not claimable" — surface it as
    // SOLD_OUT so the client can show the right message.
    if (deal.status === 'SOLD_OUT' || deal.quantityClaimed >= deal.quantityTotal) {
      throw new FlashDealSoldOutError(deal.id);
    }
    if (deal.status !== 'ACTIVE') {
      throw new FlashDealNotClaimableError('This deal is not active', {
        dealId: deal.id,
        status: deal.status,
      });
    }
    if (now < deal.startsAt.getTime() || now >= deal.endsAt.getTime()) {
      throw new FlashDealNotClaimableError('This deal is outside its claim window', {
        dealId: deal.id,
      });
    }
    // Optional stay-window restriction ("tonight only").
    if (deal.applicableStayFrom && deal.applicableStayTo) {
      if (
        cmd.checkInUtc < deal.applicableStayFrom ||
        cmd.checkOutUtc > deal.applicableStayTo
      ) {
        throw new FlashDealNotClaimableError(
          'The requested stay is outside this deal’s applicable window',
          { dealId: deal.id },
        );
      }
    }

    let claimedCount = 0;
    const booking = await this.bookings.createHold({
      guestId: cmd.guestId,
      unitId: deal.unitId,
      bookingType: cmd.bookingType,
      checkInUtc: cmd.checkInUtc,
      checkOutUtc: cmd.checkOutUtc,
      guestsCount: cmd.guestsCount,
      source: 'API',
      flashDeal: {
        dealId: deal.id,
        discountPct: deal.discountPct,
        claim: async (client: PoolClient): Promise<void> => {
          const claimed = await this.deals.tryClaim(client, deal.id);
          if (claimed === null) {
            // Lost the race for the last unit (or it flipped away from ACTIVE).
            throw new FlashDealSoldOutError(deal.id);
          }
          claimedCount = claimed;
        },
      },
    });

    // Post-commit fan-out: remaining count, and SOLD_OUT if we took the last.
    const remaining = deal.quantityTotal - claimedCount;
    this.events.publish({
      type: remaining <= 0 ? 'DEAL_SOLD_OUT' : 'DEAL_CLAIMED',
      dealId: deal.id,
      unitId: deal.unitId,
      quantityRemaining: Math.max(0, remaining),
    });
    log.info(
      { dealId: deal.id, bookingId: booking.id, remaining, discountMinor: booking.discountMinor },
      'Flash deal claimed',
    );
    return booking;
  }

  /** Lifecycle transitions driven by the scheduler worker. */
  async runLifecycle(): Promise<{ activated: string[]; ended: string[] }> {
    const activated = await this.deals.activateDue();
    const ended = await this.deals.endExpired();
    for (const id of activated) {
      const deal = await this.deals.findById(id);
      if (deal) {
        this.events.publish({
          type: 'DEAL_ACTIVATED',
          dealId: id,
          unitId: deal.unitId,
          quantityRemaining: deal.quantityTotal - deal.quantityClaimed,
        });
      }
    }
    for (const id of ended) {
      const deal = await this.deals.findById(id);
      if (deal) {
        this.events.publish({
          type: 'DEAL_ENDED',
          dealId: id,
          unitId: deal.unitId,
          quantityRemaining: deal.quantityTotal - deal.quantityClaimed,
        });
      }
    }
    if (activated.length > 0 || ended.length > 0) {
      log.info({ activated: activated.length, ended: ended.length }, 'Deal lifecycle swept');
    }
    return { activated, ended };
  }
}
