import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { OPENSEARCH_CLIENT } from '../../../infrastructure/search/opensearch.module';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  FacetBucket,
  SearchQuery,
  SearchResultItem,
  SearchResults,
} from '../domain/types';
import { UNIT_ALIAS } from '../infrastructure/unit-index';
import { buildSearchBody } from '../infrastructure/query-builder';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'SearchService' });

/**
 * The ceiling on how far an indexed coordinate sits from the true one.
 *
 * fn_property_set_approx_location (0016) projects 250–500 m, so 500 is the
 * bound rather than the actual displacement — publishing the real per-property
 * offset would hand back exactly what the displacement exists to withhold.
 * Same figure the map endpoint reports.
 */
const PRIVACY_RADIUS_METRES = 500;

interface OsHit {
  _id: string;
  _score: number | null;
  _source: {
    unitId: string;
    propertyId: string;
    unitName: string;
    propertyName: string;
    propertyType: string;
    city: string;
    location: { lat: number; lon: number };
    currency: string;
    hourlyRateMinor: number | null;
    nightlyRateMinor: number | null;
    maxGuests: number;
    amenities: string[];
    ratingAvg: number | null;
    ratingCount: number;
    instantBook: boolean;
    photos?: string[];
    turnaroundMinutes?: number;
  };
  sort?: unknown[];
}

/**
 * The two-stage search — the load-bearing design of this phase.
 *
 *  STAGE 1 (OpenSearch): fast geo + faceted candidate retrieval over the
 *  denormalized index. Ranking, pagination, and facets happen here.
 *
 *  STAGE 2 (PostgreSQL, only when a stay window is supplied): the candidate
 *  unit ids are checked against the SAME exclusion-constraint truth that
 *  guards booking — one indexed query over bookings + host blocks. Results
 *  are annotated `available`, and unavailable units are dropped.
 *
 * This is deliberate: availability is never indexed (it changes every second
 * and the DB is its only source of truth), so search can NEVER show a slot as
 * free that the booking engine would reject. OpenSearch narrows the field;
 * PostgreSQL has the final word.
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(OPENSEARCH_CLIENT) private readonly os: Client,
    private readonly db: DatabaseService,
  ) {}

  async search(query: SearchQuery): Promise<SearchResults> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const body = buildSearchBody(query);

    let response;
    try {
      response = await this.os.search({ index: UNIT_ALIAS, body });
    } catch (err) {
      log.error({ err }, 'OpenSearch query failed');
      return {
        total: 0,
        page,
        pageSize,
        items: [],
        facets: { propertyType: [], amenities: [], city: [] },
        availabilityChecked: false,
      };
    }

    const hits = (response.body.hits.hits ?? []) as OsHit[];
    const totalRaw = response.body.hits.total;
    const total = typeof totalRaw === 'number' ? totalRaw : (totalRaw?.value ?? 0);
    const hasGeo = query.lat != null && query.lon != null;

    let items: SearchResultItem[] = hits.map((hit) => ({
      unitId: hit._source.unitId,
      propertyId: hit._source.propertyId,
      unitName: hit._source.unitName,
      propertyName: hit._source.propertyName,
      propertyType: hit._source.propertyType,
      city: hit._source.city,
      // The indexed point is already the displaced one — see
      // UnitSearchDocument.location. Nothing here needs to redact it.
      location: hit._source.location,
      privacyRadiusMetres: PRIVACY_RADIUS_METRES,
      // Compute distance from the document's own coordinates — robust across
      // every sort mode (reading it out of hit.sort only works when distance
      // is the active sort key, and silently returns the price otherwise).
      distanceKm: hasGeo
        ? haversineKm(query.lat!, query.lon!, hit._source.location)
        : null,
      currency: hit._source.currency,
      hourlyRateMinor: hit._source.hourlyRateMinor,
      nightlyRateMinor: hit._source.nightlyRateMinor,
      maxGuests: hit._source.maxGuests,
      amenities: hit._source.amenities ?? [],
      ratingAvg: hit._source.ratingAvg,
      ratingCount: hit._source.ratingCount,
      instantBook: hit._source.instantBook,
      photos: hit._source.photos ?? [],
      available: null,
    }));

    // Stage 2: availability post-filter against PostgreSQL.
    let availabilityChecked = false;
    if (query.checkInUtc && query.checkOutUtc && items.length > 0) {
      const availableIds = await this.filterAvailable(
        items.map((i) => i.unitId),
        query.checkInUtc,
        query.checkOutUtc,
      );
      items = items
        .map((i) => ({ ...i, available: availableIds.has(i.unitId) }))
        .filter((i) => i.available);
      availabilityChecked = true;
    }

    return {
      total,
      page,
      pageSize,
      items,
      facets: {
        propertyType: readFacet(response.body.aggregations, 'propertyType'),
        amenities: readFacet(response.body.aggregations, 'amenities'),
        city: readFacet(response.body.aggregations, 'city'),
      },
      availabilityChecked,
    };
  }

  /**
   * Returns the subset of unitIds that are free for the window — using each
   * unit's own turnaround buffer and the exact predicate the booking overlap
   * guard uses. A unit is unavailable if any active booking OR host block
   * overlaps the blocking range.
   */
  private async filterAvailable(
    unitIds: string[],
    checkInUtc: string,
    checkOutUtc: string,
  ): Promise<Set<string>> {
    const res = await this.db.query<{ id: string }>(
      `WITH candidate AS (
         SELECT u.id, u.turnaround_minutes
         FROM units u
         WHERE u.id = ANY($1::uuid[])
       )
       SELECT c.id
       FROM candidate c
       WHERE NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.unit_id = c.id
           AND b.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
           AND b.block_range && fn_booking_block_range($2::timestamptz, $3::timestamptz, c.turnaround_minutes)
       )
       AND NOT EXISTS (
         SELECT 1 FROM unit_availability_blocks ub
         WHERE ub.unit_id = c.id
           AND ub.is_active
           AND ub.block_range && fn_booking_block_range($2::timestamptz, $3::timestamptz, c.turnaround_minutes)
       )`,
      [unitIds, checkInUtc, checkOutUtc],
    );
    return new Set(res.rows.map((r) => r.id));
  }
}

function readFacet(
  aggs: Record<string, { buckets?: { key: string; doc_count: number }[] }> | undefined,
  name: string,
): FacetBucket[] {
  const buckets = aggs?.[name]?.buckets ?? [];
  return buckets.map((b) => ({ key: b.key, count: b.doc_count }));
}

function haversineKm(
  lat: number,
  lon: number,
  point: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((point.lat - lat) * Math.PI) / 180;
  const dLon = ((point.lon - lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat * Math.PI) / 180) *
      Math.cos((point.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}
