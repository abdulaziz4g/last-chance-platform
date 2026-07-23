import { Injectable } from '@nestjs/common';
import {
  UnitNotBookableError,
  ValidationFailedError,
} from '../../../common/errors/domain-errors';
import { BookableUnit, BookingType, MoneyMinor } from '../domain/types';
import { SettingsService } from '../../settings/settings.service';

export interface PriceQuote {
  currency: string;
  baseAmountMinor: MoneyMinor;
  cleaningFeeMinor: MoneyMinor;
  serviceFeeMinor: MoneyMinor;
  taxesMinor: MoneyMinor;
  discountMinor: MoneyMinor;
  totalAmountMinor: MoneyMinor;
  commissionPct: number;
  commissionMinor: MoneyMinor;
  hostPayoutMinor: MoneyMinor;
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_NIGHT = 24 * 60;

/** Guest-facing service fee — platform revenue on top of the base price. */
const SERVICE_FEE_PCT = 3;
/** KSA VAT. Applied on base + service fee. */
const VAT_PCT = 15;

/**
 * Deterministic integer-money pricing (v1 rules). All arithmetic is on minor
 * units; every rounding decision happens exactly once, and the result always
 * satisfies the DB check constraints:
 *   total = base + cleaning + service + taxes - discount
 *   commission + host_payout <= total   (equality: base = commission + payout)
 *
 * Seasonal overrides (unit_price_overrides) plug in the same way flash-deal
 * discounts do below — the quote always carries the original base plus the
 * discount, so struck-through pricing is honest.
 */
export interface QuoteOptions {
  /** Flash-deal (or promo) percentage off the base rate. */
  discountPct?: number;
}

@Injectable()
export class PricingService {
  constructor(private readonly settings: SettingsService) {}

  quote(
    unit: BookableUnit,
    type: BookingType,
    checkInUtc: Date,
    checkOutUtc: Date,
    options: QuoteOptions = {},
  ): PriceQuote {
    const durationMinutes =
      (checkOutUtc.getTime() - checkInUtc.getTime()) / MS_PER_MINUTE;
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new ValidationFailedError(
        'check_out must be after check_in on whole minutes',
      );
    }

    // Original (struck-through) base — what the guest would pay without a deal.
    const baseAmountMinor =
      type === 'HOURLY'
        ? this.hourlyBase(unit, durationMinutes)
        : this.nightlyBase(unit, durationMinutes);

    const discountPct = options.discountPct ?? 0;
    if (discountPct < 0 || discountPct > 100) {
      throw new ValidationFailedError('discountPct must be between 0 and 100');
    }
    const discountMinor = Math.round((baseAmountMinor * discountPct) / 100);
    // Fees, tax, commission and payout are all computed on the NET base the
    // guest actually pays — the deal is a real discount, not a cosmetic one.
    const netBaseMinor = baseAmountMinor - discountMinor;

    const commissionPct =
      unit.commissionPctOverride ?? this.settings.defaultCommissionPct;

    const cleaningFeeMinor = 0; // per-unit cleaning fees: later iteration
    const serviceFeeMinor = Math.round((netBaseMinor * SERVICE_FEE_PCT) / 100);
    const taxesMinor = Math.round(
      ((netBaseMinor + serviceFeeMinor) * VAT_PCT) / 100,
    );
    // total = base + cleaning + service + taxes - discount  (DB CHECK), which
    // equals netBase + cleaning + service + taxes.
    const totalAmountMinor =
      baseAmountMinor + cleaningFeeMinor + serviceFeeMinor + taxesMinor - discountMinor;
    const commissionMinor = Math.round((netBaseMinor * commissionPct) / 100);
    const hostPayoutMinor = netBaseMinor - commissionMinor;

    return {
      currency: unit.currency,
      baseAmountMinor,
      cleaningFeeMinor,
      serviceFeeMinor,
      taxesMinor,
      discountMinor,
      totalAmountMinor,
      commissionPct,
      commissionMinor,
      hostPayoutMinor,
    };
  }

  private hourlyBase(unit: BookableUnit, durationMinutes: number): MoneyMinor {
    if (!unit.supportsHourly || unit.baseHourlyRateMinor == null) {
      throw new UnitNotBookableError('This unit does not offer hourly stays');
    }
    if (durationMinutes < unit.minHourlyDurationMinutes) {
      throw new ValidationFailedError(
        `Hourly stays require at least ${unit.minHourlyDurationMinutes} minutes`,
        { minMinutes: unit.minHourlyDurationMinutes },
      );
    }
    const maxMinutes = this.settings.maxHourlyBookingHours * MINUTES_PER_HOUR;
    if (durationMinutes > maxMinutes) {
      throw new ValidationFailedError(
        `Hourly stays are capped at ${this.settings.maxHourlyBookingHours} hours`,
        { maxMinutes },
      );
    }
    if (durationMinutes % MINUTES_PER_HOUR !== 0) {
      throw new ValidationFailedError(
        'Hourly stays are billed in whole-hour blocks',
      );
    }
    return (durationMinutes / MINUTES_PER_HOUR) * unit.baseHourlyRateMinor;
  }

  private nightlyBase(unit: BookableUnit, durationMinutes: number): MoneyMinor {
    if (!unit.supportsNightly || unit.baseNightlyRateMinor == null) {
      throw new UnitNotBookableError('This unit does not offer nightly stays');
    }
    if (durationMinutes % MINUTES_PER_NIGHT !== 0) {
      throw new ValidationFailedError(
        'Nightly stays must span whole 24h nights (UTC instants derived from property-local check-in/out times)',
      );
    }
    const nights = durationMinutes / MINUTES_PER_NIGHT;
    return nights * unit.baseNightlyRateMinor;
  }
}
