/**
 * Flash-deal domain types — 1:1 with the PostgreSQL schema (migration 0008).
 * A flash deal grants a % discount to the first N bookings of a unit made
 * during its claim window. Because units are quantity-1 resources, the N
 * claims are necessarily for different (non-overlapping) stay windows — the
 * exclusion constraint still guarantees no double-booking.
 */
export const FLASH_DEAL_STATUSES = [
  'SCHEDULED',
  'ACTIVE',
  'SOLD_OUT',
  'ENDED',
  'CANCELLED',
] as const;
export type FlashDealStatus = (typeof FLASH_DEAL_STATUSES)[number];

export interface FlashDeal {
  id: string;
  unitId: string;
  createdBy: string;
  title: string;
  discountPct: number;
  status: FlashDealStatus;
  startsAt: Date;
  endsAt: Date;
  applicableStayFrom: Date | null;
  applicableStayTo: Date | null;
  quantityTotal: number;
  quantityClaimed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlashDealView {
  id: string;
  unitId: string;
  propertyId: string;
  propertyName: string;
  unitName: string;
  city: string;
  title: string;
  discountPct: number;
  status: FlashDealStatus;
  startsAt: string;
  endsAt: string;
  quantityTotal: number;
  quantityClaimed: number;
  quantityRemaining: number;
  currency: string;
  baseHourlyRateMinor: number | null;
  baseNightlyRateMinor: number | null;
  /** Seconds until endsAt at the moment of the response (countdown seed). */
  secondsRemaining: number;
}

export interface CreateDealInput {
  unitId: string;
  /** The creating host; null falls back to the unit's owning host (dev/
   *  no-JWT path). The DB FK to users(id) guarantees a real creator either way. */
  createdBy: string | null;
  title: string;
  discountPct: number;
  startsAt: Date;
  endsAt: Date;
  quantityTotal: number;
  applicableStayFrom?: Date | null;
  applicableStayTo?: Date | null;
}
