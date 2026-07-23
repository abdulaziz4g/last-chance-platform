/**
 * Domain vocabulary — mirrors the PostgreSQL enums 1:1 (db migration 0002).
 * The database is the source of truth; these types exist so the mirror is
 * checked by the compiler everywhere it is used.
 */

export const BOOKING_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that hold inventory — must match the partial EXCLUDE predicate. */
export const INVENTORY_BLOCKING_STATUSES: readonly BookingStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
];

export const BOOKING_TYPES = ['HOURLY', 'NIGHTLY'] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export const ACTOR_TYPES = ['GUEST', 'HOST', 'ADMIN', 'SUPPORT', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const BOOKING_SOURCES = ['WEB', 'IOS', 'ANDROID', 'ADMIN', 'API'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/** All money is integer minor units (halalas/cents) — never floats. */
export type MoneyMinor = number;

export interface Booking {
  id: string;
  bookingCode: string;
  guestId: string;
  unitId: string;
  propertyId: string;
  bookingType: BookingType;
  status: BookingStatus;
  source: BookingSource;
  checkInUtc: Date;
  checkOutUtc: Date;
  turnaroundMinutes: number;
  guestsCount: number;
  holdExpiresAt: Date | null;
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
  flashDealId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookableUnit {
  id: string;
  propertyId: string;
  supportsHourly: boolean;
  supportsNightly: boolean;
  maxGuests: number;
  currency: string;
  baseNightlyRateMinor: MoneyMinor | null;
  baseHourlyRateMinor: MoneyMinor | null;
  minHourlyDurationMinutes: number;
  turnaroundMinutes: number;
  unitStatus: string;
  propertyStatus: string;
  hostId: string;
  commissionPctOverride: number | null;
}
