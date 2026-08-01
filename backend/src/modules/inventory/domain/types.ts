import type { MoneyMinor } from '../../booking/domain/types';

/**
 * The read model behind a public unit page. Deliberately richer than the
 * search document: search optimises for filtering many units, this answers
 * "should I book *this* one" — description, house rules, host, reviews.
 */

export interface UnitDetailUnit {
  id: string;
  name: string;
  unitType: string;
  status: string;
  supportsHourly: boolean;
  supportsNightly: boolean;
  maxGuests: number;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  areaSqm: number | null;
  currency: string;
  hourlyRateMinor: MoneyMinor | null;
  nightlyRateMinor: MoneyMinor | null;
  minHourlyDurationMinutes: number;
  turnaroundMinutes: number;
  instantBook: boolean;
  photos: string[];
}

export interface UnitDetailProperty {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  propertyType: string;
  city: string;
  countryCode: string;
  timezone: string;

  // NO addressLine1. It used to be here, qualified as "never the full address
  // before a booking is confirmed" — but this endpoint is @Public() and has no
  // booking check, so the qualifier described an intention rather than a rule.
  // A street line beside a coordinate is the whole address for a villa, which
  // is precisely what 0016's displacement exists to withhold. The true
  // location and the street line are a post-booking reveal and belong on a
  // path that can check for one.

  /**
   * APPROXIMATE, from properties.approx_location — displaced 250–500 m on a
   * bearing derived from the property id. Was the true `location` until the
   * privacy fix; a guest reaching this page from a deliberately vague map pin
   * could otherwise read the exact position straight out of the payload.
   */
  lat: number;
  lon: number;
  /** How far off that point may be. Same figure map search publishes. */
  privacyRadiusMetres: number;
  amenities: string[];
  policies: Record<string, unknown>;
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface UnitDetailHost {
  id: string;
  displayName: string;
  bio: string | null;
  isSuperhost: boolean;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface UnitReview {
  id: string;
  overallRating: number;
  comment: string | null;
  hostReply: string | null;
  createdAt: Date;
  authorName: string;
}

export interface UnitDetailDeal {
  id: string;
  title: string;
  discountPct: number;
  endsAt: Date;
  quantityRemaining: number;
}

export interface UnitDetail {
  unit: UnitDetailUnit;
  property: UnitDetailProperty;
  host: UnitDetailHost;
  reviews: UnitReview[];
  /** The live flash deal on this unit, if one is running right now. */
  activeDeal: UnitDetailDeal | null;
}
