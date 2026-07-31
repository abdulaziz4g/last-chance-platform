import type { BookingType } from '../../booking/domain/types';

export interface MapSearchQuery {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  bookingType: BookingType;
  checkInUtc: Date | null;
  checkOutUtc: Date | null;
  guests: number | null;
  limit: number;
}

export interface MapPinDeal {
  dealId: string;
  discountPct: number;
  /** Drives the countdown the clients render; also what the gold pulse means. */
  endsAt: Date | null;
}

export interface MapPin {
  unitId: string;
  propertyId: string;
  unitName: string;
  propertyName: string;
  propertySlug: string;
  propertyType: string;
  unitType: string;
  city: string;
  district: string | null;
  maxGuests: number;
  currency: string;
  ratingAvg: number | null;
  ratingCount: number;
  photos: unknown[];

  /** Deliberately approximate — see MapSearchRepository. */
  approxLat: number;
  approxLng: number;
  privacyRadiusMetres: number;

  /** Undiscounted rate, for struck-through display. */
  basePriceMinor: number;
  /** What the guest would actually pay — discount already applied. */
  priceMinor: number;
  bookingType: BookingType;
  deal: MapPinDeal | null;
}
