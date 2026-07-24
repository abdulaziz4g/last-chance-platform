/**
 * Search domain types. The indexed document is a DENORMALIZED projection of a
 * unit + its property — everything a search result card and a facet needs,
 * with zero joins at query time. Availability is deliberately NOT indexed:
 * it changes every second and the PostgreSQL exclusion constraint is its only
 * source of truth (see the two-stage search in search.service.ts).
 */
export interface UnitSearchDocument {
  unitId: string;
  propertyId: string;
  hostId: string;
  unitName: string;
  propertyName: string;
  propertyType: string;
  unitType: string;
  city: string;
  cityText: string;
  countryCode: string;
  /** OpenSearch geo_point: { lat, lon }. */
  location: { lat: number; lon: number };
  supportsHourly: boolean;
  supportsNightly: boolean;
  maxGuests: number;
  currency: string;
  hourlyRateMinor: number | null;
  nightlyRateMinor: number | null;
  amenities: string[];
  ratingAvg: number | null;
  ratingCount: number;
  instantBook: boolean;
  /** Only ACTIVE units of ACTIVE, non-deleted properties are indexed. */
  indexedAt: string;
}

export type StayMode = 'HOURLY' | 'NIGHTLY';

export interface SearchQuery {
  text?: string;
  /** Geo radius search anchor + distance in km. */
  lat?: number;
  lon?: number;
  radiusKm?: number;
  city?: string;
  mode?: StayMode;
  guests?: number;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  amenities?: string[];
  instantBookOnly?: boolean;
  /** Optional availability window (UTC ISO) — triggers the DB post-filter. */
  checkInUtc?: string;
  checkOutUtc?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'distance';
  page?: number;
  pageSize?: number;
}

export interface SearchResultItem {
  unitId: string;
  propertyId: string;
  unitName: string;
  propertyName: string;
  propertyType: string;
  city: string;
  location: { lat: number; lon: number };
  distanceKm: number | null;
  currency: string;
  hourlyRateMinor: number | null;
  nightlyRateMinor: number | null;
  maxGuests: number;
  amenities: string[];
  ratingAvg: number | null;
  ratingCount: number;
  instantBook: boolean;
  /** Present only when the query carried an availability window. */
  available: boolean | null;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchResults {
  total: number;
  page: number;
  pageSize: number;
  items: SearchResultItem[];
  facets: {
    propertyType: FacetBucket[];
    amenities: FacetBucket[];
    city: FacetBucket[];
  };
  /** True when availability post-filtering ran against PostgreSQL. */
  availabilityChecked: boolean;
}
