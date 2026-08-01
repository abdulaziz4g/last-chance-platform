import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { OPENSEARCH_CLIENT } from '../../../infrastructure/search/opensearch.module';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { UnitSearchDocument } from '../domain/types';
import {
  UNIT_ALIAS,
  UNIT_INDEX_V1,
  UNIT_INDEX_CURRENT,
  unitIndexBody,
} from './unit-index';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'UnitIndexer' });

/**
 * Projects the PostgreSQL source of truth into the OpenSearch unit index.
 *
 * Two entry points:
 *   - ensureIndex()/reindexAll(): bootstrap + full rebuild (bulk, aliased).
 *   - indexUnit()/removeUnit(): incremental single-doc upserts, called on
 *     unit/property/review changes (wired to domain events in a later pass;
 *     the methods exist and are exercised by the smoke today).
 *
 * PostgreSQL remains authoritative for everything; the index is a
 * rebuildable read model — losing it entirely is a reindexAll away.
 */
@Injectable()
export class UnitIndexer {
  constructor(
    @Inject(OPENSEARCH_CLIENT) private readonly os: Client,
    private readonly db: DatabaseService,
  ) {}

  async ensureIndex(): Promise<void> {
    const exists = await this.os.indices.exists({ index: UNIT_INDEX_CURRENT });
    if (!exists.body) {
      await this.os.indices.create({
        index: UNIT_INDEX_CURRENT,
        body: unitIndexBody,
      });
      log.info({ index: UNIT_INDEX_CURRENT }, 'Created unit index');
    } else {
      await this.syncAdditiveMappings();
    }

    const aliasExists = await this.os.indices.existsAlias({ name: UNIT_ALIAS });
    if (!aliasExists.body) {
      await this.os.indices.putAlias({
        index: UNIT_INDEX_CURRENT,
        name: UNIT_ALIAS,
      });
      log.info({ alias: UNIT_ALIAS, index: UNIT_INDEX_CURRENT }, 'Bound search alias');
      return;
    }

    // Deliberately NOT migrated here. ensureIndex runs at every boot, and a
    // version bump makes the new index EMPTY — flipping to it on startup would
    // take live search to zero results and hold it there until someone
    // remembered to reindex. The alias moves in promoteCurrentIndex() once the
    // new index actually has documents in it.
    const target = await this.aliasTarget();
    if (target && target !== UNIT_INDEX_CURRENT) {
      log.warn(
        { alias: UNIT_ALIAS, servingIndex: target, currentIndex: UNIT_INDEX_CURRENT },
        'Search alias still serves the previous index version; run a reindex to promote',
      );
    }
  }

  private async aliasTarget(): Promise<string | undefined> {
    const aliasInfo = await this.os.cat.aliases({ name: UNIT_ALIAS, format: 'json' });
    return (aliasInfo.body as { index: string }[])[0]?.index;
  }

  /**
   * Points the alias at the current index version, atomically.
   *
   * Called only after the new index has been filled, so a version bump is a
   * blue/green swap rather than a window of empty results. Atomic because
   * remove+add in one updateAliases call never leaves the alias unbound —
   * two separate calls would, and a search landing in that gap gets an
   * index_not_found rather than a stale-but-working result.
   */
  private async promoteCurrentIndex(): Promise<void> {
    const target = await this.aliasTarget();
    if (target === UNIT_INDEX_CURRENT) return;

    await this.os.indices.updateAliases({
      body: {
        actions: [
          ...(target
            ? [{ remove: { index: target, alias: UNIT_ALIAS } }]
            : []),
          { add: { index: UNIT_INDEX_CURRENT, alias: UNIT_ALIAS } },
        ],
      },
    });
    log.info(
      { alias: UNIT_ALIAS, from: target, to: UNIT_INDEX_CURRENT },
      'Migrated search alias to new index version',
    );
  }

  /**
   * Applies fields the index does not have yet.
   *
   * Creating the index is a one-time event, so a field added to the mapping
   * later never reached an index that already existed — the document still
   * round-trips through `_source`, which is why this is easy to miss, but
   * OpenSearch's dynamic mapping then invents its own mapping for the field.
   * For `photos` that would mean every URL landing in the inverted index, the
   * exact opposite of the `index: false` it is declared with.
   *
   * Only additive changes work this way: OpenSearch will not redefine an
   * existing field. Changing a field's type still needs an index version bump
   * and the alias migration below.
   */
  private async syncAdditiveMappings(): Promise<void> {
    const current = await this.os.indices.getMapping({
      index: UNIT_INDEX_CURRENT,
    });
    const live =
      (current.body as Record<string, { mappings?: { properties?: object } }>)[
        UNIT_INDEX_CURRENT
      ]?.mappings?.properties ?? {};

    const declared = unitIndexBody.mappings.properties as Record<string, unknown>;
    const missing = Object.fromEntries(
      Object.entries(declared).filter(([field]) => !(field in live)),
    );
    if (Object.keys(missing).length === 0) return;

    await this.os.indices.putMapping({
      index: UNIT_INDEX_CURRENT,
      body: { properties: missing },
    });
    log.info(
      { index: UNIT_INDEX_CURRENT, fields: Object.keys(missing) },
      'Added missing fields to unit index mapping',
    );
  }

  /**
   * Full rebuild via bulk indexing, then promotion. Returns the docs indexed.
   *
   * Writes to UNIT_INDEX_CURRENT by name rather than through the alias: after
   * a version bump the alias still points at the OLD index, so bulk-indexing
   * through it would refill the index being replaced and leave the new one
   * permanently empty.
   */
  async reindexAll(): Promise<number> {
    await this.ensureIndex();
    const docs = await this.loadDocuments();

    if (docs.length > 0) {
      const body = docs.flatMap((doc) => [
        { index: { _index: UNIT_INDEX_CURRENT, _id: doc.unitId } },
        doc,
      ]);
      const res = await this.os.bulk({ body, refresh: true });
      if (res.body.errors) {
        const firstError = res.body.items.find(
          (i: Record<string, { error?: unknown }>) =>
            Object.values(i)[0]?.error,
        );
        log.error({ firstError }, 'Bulk index reported errors');
        // Promoting a half-built index would serve a partial catalogue as if
        // it were the whole one. The previous version keeps serving instead.
        throw new Error('Bulk index reported errors; alias not promoted');
      }
    }

    // Promoted even at zero documents: an empty rebuild is still an
    // authoritative statement about what is bookable, and leaving the alias on
    // the old index would keep serving listings that are no longer indexable.
    await this.promoteCurrentIndex();

    log.info({ count: docs.length }, 'Reindexed units');
    return docs.length;
  }

  async indexUnit(unitId: string): Promise<boolean> {
    const docs = await this.loadDocuments(unitId);
    if (docs.length === 0) {
      // No longer indexable (deactivated/deleted/property inactive) — evict.
      await this.removeUnit(unitId);
      return false;
    }
    await this.os.index({
      index: UNIT_ALIAS,
      id: unitId,
      body: docs[0],
      refresh: true,
    });
    return true;
  }

  async removeUnit(unitId: string): Promise<void> {
    try {
      await this.os.delete({ index: UNIT_ALIAS, id: unitId, refresh: true });
    } catch {
      /* already absent — idempotent */
    }
  }

  /** The denormalizing projection query — the single place the index shape is
   *  defined in SQL. Only bookable inventory is indexed. */
  private async loadDocuments(unitId?: string): Promise<UnitSearchDocument[]> {
    const res = await this.db.query<{
      unit_id: string;
      property_id: string;
      host_id: string;
      unit_name: string;
      property_name: string;
      property_type: string;
      unit_type: string;
      city: string;
      country_code: string;
      lat: number;
      lon: number;
      supports_hourly: boolean;
      supports_nightly: boolean;
      max_guests: number;
      currency: string;
      hourly_rate_minor: number | null;
      nightly_rate_minor: number | null;
      amenities: unknown;
      rating_avg: number | null;
      rating_count: number;
      instant_book: boolean;
      photos: unknown;
    }>(
      `SELECT u.id AS unit_id, u.property_id, p.host_id,
              u.name AS unit_name, p.name AS property_name,
              p.property_type::text, u.unit_type::text,
              p.city, p.country_code,
              -- APPROXIMATE, never p.location. This index serves a @Public()
              -- endpoint, and the true point is a post-booking reveal only
              -- (0016). Withholding it from the RESPONSE alone would not be
              -- enough: geo_distance filtering and _geo_distance sorting run
              -- over whatever is indexed, so exact coordinates here are an
              -- oracle — vary lat/lon and radiusKm, watch a unit appear and
              -- disappear, and the true position falls out by bisection. The
              -- displaced point has to be what the index holds.
              ST_Y(p.approx_location::geometry) AS lat,
              ST_X(p.approx_location::geometry) AS lon,
              u.supports_hourly, u.supports_nightly, u.max_guests, u.currency,
              u.base_hourly_rate_minor AS hourly_rate_minor,
              u.base_nightly_rate_minor AS nightly_rate_minor,
              p.amenities,
              p.rating_avg, p.rating_count, u.instant_book, u.photos
       FROM units u
       JOIN properties p ON p.id = u.property_id
       WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
         AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
         -- Regulatory gate (0016): an unapproved listing must never reach the
         -- OpenSearch index. Note this means approval has to trigger a
         -- reindex for the listing to become searchable.
         AND p.moderation_status = 'APPROVED'
         AND ($1::uuid IS NULL OR u.id = $1::uuid)`,
      [unitId ?? null],
    );

    const now = new Date().toISOString();
    return res.rows.map((r) => ({
      unitId: r.unit_id,
      propertyId: r.property_id,
      hostId: r.host_id,
      unitName: r.unit_name,
      propertyName: r.property_name,
      propertyType: r.property_type,
      unitType: r.unit_type,
      city: r.city,
      cityText: r.city,
      countryCode: r.country_code,
      location: { lat: r.lat, lon: r.lon },
      supportsHourly: r.supports_hourly,
      supportsNightly: r.supports_nightly,
      maxGuests: r.max_guests,
      currency: r.currency,
      hourlyRateMinor: r.hourly_rate_minor,
      nightlyRateMinor: r.nightly_rate_minor,
      amenities: Array.isArray(r.amenities) ? (r.amenities as string[]) : [],
      ratingAvg: r.rating_avg,
      ratingCount: r.rating_count,
      instantBook: r.instant_book,
      photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
      indexedAt: now,
    }));
  }
}
