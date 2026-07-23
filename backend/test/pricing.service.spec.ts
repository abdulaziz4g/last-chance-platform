import { PricingService } from '../src/modules/booking/application/pricing.service';
import {
  UnitNotBookableError,
  ValidationFailedError,
} from '../src/common/errors/domain-errors';
import type { SettingsService } from '../src/modules/settings/settings.service';
import type { BookableUnit } from '../src/modules/booking/domain/types';

const settingsStub = {
  defaultCommissionPct: 15,
  maxHourlyBookingHours: 12,
  holdMinutes: 10,
} as unknown as SettingsService;

const unit: BookableUnit = {
  id: 'u1',
  propertyId: 'p1',
  supportsHourly: true,
  supportsNightly: true,
  maxGuests: 2,
  currency: 'SAR',
  baseNightlyRateMinor: 30_000,
  baseHourlyRateMinor: 8_000,
  minHourlyDurationMinutes: 60,
  turnaroundMinutes: 30,
  unitStatus: 'ACTIVE',
  propertyStatus: 'ACTIVE',
  hostId: 'h1',
  commissionPctOverride: null,
};

const at = (iso: string): Date => new Date(iso);

describe('PricingService', () => {
  const pricing = new PricingService(settingsStub);

  it('prices a 4-hour stay and satisfies every DB money constraint', () => {
    const q = pricing.quote(
      unit,
      'HOURLY',
      at('2026-08-01T10:00:00Z'),
      at('2026-08-01T14:00:00Z'),
    );

    expect(q.baseAmountMinor).toBe(32_000); // 4h * 8000
    expect(q.serviceFeeMinor).toBe(960); // 3%
    expect(q.taxesMinor).toBe(4_944); // 15% VAT on base+fee
    expect(q.totalAmountMinor).toBe(37_904);
    expect(q.commissionMinor).toBe(4_800); // 15% of base
    expect(q.hostPayoutMinor).toBe(27_200);

    // Mirrors of the Phase 1 CHECK constraints — a quote violating either
    // would be rejected by PostgreSQL at insert.
    expect(q.totalAmountMinor).toBe(
      q.baseAmountMinor +
        q.cleaningFeeMinor +
        q.serviceFeeMinor +
        q.taxesMinor -
        q.discountMinor,
    );
    expect(q.commissionMinor + q.hostPayoutMinor).toBeLessThanOrEqual(
      q.totalAmountMinor,
    );
  });

  it('prices whole nights and uses the host commission override', () => {
    const q = pricing.quote(
      { ...unit, commissionPctOverride: 10 },
      'NIGHTLY',
      at('2026-08-01T12:00:00Z'),
      at('2026-08-03T12:00:00Z'),
    );
    expect(q.baseAmountMinor).toBe(60_000); // 2 nights
    expect(q.commissionPct).toBe(10);
    expect(q.commissionMinor).toBe(6_000);
    expect(q.hostPayoutMinor).toBe(54_000);
  });

  it('applies a flash-deal discount on the net base and satisfies DB constraints', () => {
    const full = pricing.quote(
      unit,
      'HOURLY',
      at('2026-08-01T10:00:00Z'),
      at('2026-08-01T14:00:00Z'),
    );
    const deal = pricing.quote(
      unit,
      'HOURLY',
      at('2026-08-01T10:00:00Z'),
      at('2026-08-01T14:00:00Z'),
      { discountPct: 25 },
    );

    // Base is the ORIGINAL (struck-through) price; discount is 25% of it.
    expect(deal.baseAmountMinor).toBe(32_000);
    expect(deal.discountMinor).toBe(8_000);
    // Fees, tax, commission, payout all computed on the net (24000) base.
    const net = 24_000;
    expect(deal.serviceFeeMinor).toBe(Math.round(net * 0.03)); // 720
    expect(deal.taxesMinor).toBe(Math.round((net + 720) * 0.15)); // 3708
    expect(deal.commissionMinor).toBe(Math.round(net * 0.15)); // 3600
    expect(deal.hostPayoutMinor).toBe(net - 3_600); // 20400

    // The DB CHECK: total = base + cleaning + service + taxes - discount.
    expect(deal.totalAmountMinor).toBe(
      deal.baseAmountMinor +
        deal.cleaningFeeMinor +
        deal.serviceFeeMinor +
        deal.taxesMinor -
        deal.discountMinor,
    );
    // commission + payout <= total (both computed on net here).
    expect(deal.commissionMinor + deal.hostPayoutMinor).toBeLessThanOrEqual(
      deal.totalAmountMinor,
    );
    // The guest genuinely pays less than the undiscounted total.
    expect(deal.totalAmountMinor).toBeLessThan(full.totalAmountMinor);
  });

  it('rejects out-of-range discounts', () => {
    expect(() =>
      pricing.quote(unit, 'HOURLY', at('2026-08-01T10:00:00Z'), at('2026-08-01T12:00:00Z'), {
        discountPct: 150,
      }),
    ).toThrow(ValidationFailedError);
  });

  it('rejects invalid durations and unsupported modes', () => {
    const h = (from: string, to: string) =>
      pricing.quote(unit, 'HOURLY', at(from), at(to));

    // below unit minimum
    expect(() => h('2026-08-01T10:00:00Z', '2026-08-01T10:30:00Z')).toThrow(
      ValidationFailedError,
    );
    // not whole hours
    expect(() => h('2026-08-01T10:00:00Z', '2026-08-01T11:30:00Z')).toThrow(
      ValidationFailedError,
    );
    // beyond the platform hourly cap (12h)
    expect(() => h('2026-08-01T08:00:00Z', '2026-08-01T21:00:00Z')).toThrow(
      ValidationFailedError,
    );
    // partial night
    expect(() =>
      pricing.quote(
        unit,
        'NIGHTLY',
        at('2026-08-01T12:00:00Z'),
        at('2026-08-02T18:00:00Z'),
      ),
    ).toThrow(ValidationFailedError);
    // hourly not offered
    expect(() =>
      pricing.quote(
        { ...unit, supportsHourly: false },
        'HOURLY',
        at('2026-08-01T10:00:00Z'),
        at('2026-08-01T12:00:00Z'),
      ),
    ).toThrow(UnitNotBookableError);
  });
});
