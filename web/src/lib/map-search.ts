/**
 * Viewport search types and the browser-side fetch.
 *
 * Separate from lib/api.ts on purpose: that module reaches next/headers via
 * lib/session and is server-only, while the map refetches on every pan and
 * must run in the browser. The endpoint is public, so no session is involved.
 */

export type BookingType = 'HOURLY' | 'NIGHTLY';

export interface MapPinDeal {
  dealId: string;
  discountPct: number;
  endsAt: string | null;
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
  photos: string[];

  /**
   * Deliberately displaced by 250–500 m — the API never returns a property's
   * true coordinates before a booking is confirmed.
   */
  approxLat: number;
  approxLng: number;
  privacyRadiusMetres: number;

  basePriceMinor: number;
  priceMinor: number;
  bookingType: BookingType;
  deal: MapPinDeal | null;
}

export interface MapBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface MapSearchParams extends MapBounds {
  bookingType: BookingType;
  checkInUtc?: string | null;
  checkOutUtc?: string | null;
  guests?: number | null;
  limit?: number;
}

export interface MapSearchResult {
  pins: MapPin[];
  /** The viewport held more than the server would return — tell the user. */
  truncated: boolean;
}

/** Mirrors the server's cap, so the client can avoid a certain-to-fail request. */
export const MAX_VIEWPORT_SPAN_DEGREES = 5;

export function boundsAreSearchable(b: MapBounds): boolean {
  return (
    b.maxLng > b.minLng &&
    b.maxLat > b.minLat &&
    b.maxLng - b.minLng <= MAX_VIEWPORT_SPAN_DEGREES &&
    b.maxLat - b.minLat <= MAX_VIEWPORT_SPAN_DEGREES
  );
}

export async function fetchMapSearch(
  params: MapSearchParams,
  signal?: AbortSignal,
): Promise<MapSearchResult> {
  const q = new URLSearchParams({
    min_lng: String(params.minLng),
    min_lat: String(params.minLat),
    max_lng: String(params.maxLng),
    max_lat: String(params.maxLat),
    booking_type: params.bookingType,
  });
  // Both or neither: sending half a range makes the server reject outright
  // rather than silently disabling availability filtering.
  if (params.checkInUtc && params.checkOutUtc) {
    q.set('check_in_utc', params.checkInUtc);
    q.set('check_out_utc', params.checkOutUtc);
  }
  if (params.guests) q.set('guests', String(params.guests));
  if (params.limit) q.set('limit', String(params.limit));

  const res = await fetch(`/api/map-search?${q.toString()}`, {
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Map search failed (${res.status})`);
  }
  return (await res.json()) as MapSearchResult;
}

/** Minor units to a display string, e.g. 84000 SAR -> "SAR 840". */
export function formatPinPrice(minor: number, currency: string): string {
  const major = minor / 100;
  // Whole numbers on a pin: two decimals is noise at marker size.
  return `${currency} ${Math.round(major).toLocaleString()}`;
}
