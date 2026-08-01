import { Client } from '@opensearch-project/opensearch';
import { SearchService } from '../src/modules/search/application/search.service';
import { DatabaseService } from '../src/infrastructure/database/database.service';
import { UnitIndexer } from '../src/modules/search/infrastructure/unit-indexer.service';
import {
  UNIT_ALIAS,
  UNIT_INDEX_CURRENT,
  UNIT_INDEX_V2,
} from '../src/modules/search/infrastructure/unit-index';

/**
 * The public search endpoint must never publish a property's true position.
 *
 * The index holds the displaced point (see UnitIndexer.loadDocuments), so
 * these cover the contract around it: what the service reports about the
 * coordinate it hands back, and that a version bump cannot leave the alias
 * serving documents built from the exact one.
 */

const source = {
  unitId: 'u1',
  propertyId: 'p1',
  unitName: 'Nabataean Suite',
  propertyName: 'Dar Tantora',
  propertyType: 'HOTEL',
  city: 'AlUla',
  // Already displaced when it reaches the service.
  location: { lat: 26.609308, lon: 37.9231 },
  currency: 'SAR',
  hourlyRateMinor: null,
  nightlyRateMinor: 145000,
  maxGuests: 2,
  amenities: [],
  ratingAvg: 4.8,
  ratingCount: 12,
  instantBook: true,
};

function serviceWithHits(hits: unknown[]): SearchService {
  const os = {
    search: () =>
      Promise.resolve({
        body: {
          hits: { hits, total: { value: hits.length } },
          aggregations: {},
        },
      }),
  } as unknown as Client;
  const db = {} as DatabaseService;
  return new SearchService(os, db);
}

describe('search results describe their coordinate as approximate', () => {
  it('publishes the privacy radius alongside every result', async () => {
    // Without it a client has no way to know the point is displaced, and
    // rendering a search hit as an exact marker is the natural mistake.
    const service = serviceWithHits([{ _id: 'u1', _score: 1, _source: source }]);
    const results = await service.search({});
    expect(results.items).toHaveLength(1);
    expect(results.items[0].privacyRadiusMetres).toBe(500);
  });

  it('reports the bound, not the actual per-property displacement', async () => {
    // The real offset is derived from the property id and lands in
    // [250, 500] m. Publishing it would hand back the very quantity the
    // displacement exists to withhold — subtract it and the true point is a
    // circle of radius zero.
    const service = serviceWithHits([{ _id: 'u1', _score: 1, _source: source }]);
    const results = await service.search({});
    expect(results.items[0].privacyRadiusMetres).toBe(500);
  });

  it('measures distance from the indexed point, not from anything truer', async () => {
    const service = serviceWithHits([{ _id: 'u1', _score: 1, _source: source }]);
    const results = await service.search({
      lat: source.location.lat,
      lon: source.location.lon,
    });
    // Zero because the anchor IS the indexed point; the service has no other
    // coordinate available to measure from, which is the property under test.
    expect(results.items[0].distanceKm).toBeCloseTo(0, 5);
  });

  it('leaves distance null when the query carries no anchor', async () => {
    const service = serviceWithHits([{ _id: 'u1', _score: 1, _source: source }]);
    const results = await service.search({});
    expect(results.items[0].distanceKm).toBeNull();
  });
});

describe('index version promotion', () => {
  /**
   * Records alias state so the ordering can be asserted: the point of the
   * blue/green swap is WHEN the alias moves, not merely that it does.
   */
  function fakeIndexer(opts: { aliasOn: string; indexExists: boolean }) {
    const calls: string[] = [];
    let aliasTarget = opts.aliasOn;

    const os = {
      indices: {
        exists: () => Promise.resolve({ body: opts.indexExists }),
        create: () => {
          calls.push('create');
          return Promise.resolve({});
        },
        existsAlias: () => Promise.resolve({ body: true }),
        getMapping: () =>
          Promise.resolve({ body: { [UNIT_INDEX_CURRENT]: { mappings: { properties: {} } } } }),
        putMapping: () => Promise.resolve({}),
        putAlias: () => Promise.resolve({}),
        updateAliases: ({ body }: { body: { actions: Record<string, { index: string }>[] } }) => {
          calls.push('promote');
          const add = body.actions.find((a) => 'add' in a);
          if (add) aliasTarget = (add as { add: { index: string } }).add.index;
          return Promise.resolve({});
        },
      },
      bulk: () => {
        calls.push('bulk');
        return Promise.resolve({ body: { errors: false, items: [] } });
      },
      cat: {
        aliases: () => Promise.resolve({ body: [{ index: aliasTarget }] }),
      },
    } as unknown as Client;

    const db = {
      query: () =>
        Promise.resolve({
          rows: [
            {
              unit_id: 'u1',
              property_id: 'p1',
              host_id: 'h1',
              unit_name: 'Suite',
              property_name: 'Dar',
              property_type: 'HOTEL',
              unit_type: 'ROOM',
              city: 'AlUla',
              country_code: 'SA',
              lat: 26.6,
              lon: 37.9,
              supports_hourly: false,
              supports_nightly: true,
              max_guests: 2,
              currency: 'SAR',
              hourly_rate_minor: null,
              nightly_rate_minor: 145000,
              amenities: [],
              rating_avg: null,
              rating_count: 0,
              instant_book: true,
              photos: [],
            },
          ],
        }),
    } as unknown as DatabaseService;

    return {
      indexer: new UnitIndexer(os, db),
      calls,
      aliasTargetNow: () => aliasTarget,
    };
  }

  it('does not move the alias at boot, which would empty live search', async () => {
    // ensureIndex runs on every boot. A version bump makes the new index
    // empty, so flipping here would take search to zero results and hold it
    // there until someone remembered to reindex.
    const h = fakeIndexer({ aliasOn: UNIT_INDEX_V2, indexExists: false });
    await h.indexer.ensureIndex();

    expect(h.calls).not.toContain('promote');
    expect(h.aliasTargetNow()).toBe(UNIT_INDEX_V2);
  });

  it('promotes only after the new index has been filled', async () => {
    const h = fakeIndexer({ aliasOn: UNIT_INDEX_V2, indexExists: false });
    await h.indexer.reindexAll();

    // Order is the assertion: bulk first, promote second.
    expect(h.calls.indexOf('bulk')).toBeGreaterThanOrEqual(0);
    expect(h.calls.indexOf('promote')).toBeGreaterThan(h.calls.indexOf('bulk'));
    expect(h.aliasTargetNow()).toBe(UNIT_INDEX_CURRENT);
  });

  it('is a no-op promotion when the alias already serves the current index', async () => {
    const h = fakeIndexer({ aliasOn: UNIT_INDEX_CURRENT, indexExists: true });
    await h.indexer.reindexAll();
    expect(h.calls).not.toContain('promote');
    expect(h.aliasTargetNow()).toBe(UNIT_INDEX_CURRENT);
  });

  it('leaves the previous version serving when the rebuild reports errors', async () => {
    // A half-built index promoted into place serves a partial catalogue as if
    // it were the whole one — worse than serving a slightly stale complete one.
    const failing = fakeIndexer({ aliasOn: UNIT_INDEX_V2, indexExists: true });
    const os = (failing.indexer as unknown as { os: Client }).os;
    (os as unknown as { bulk: () => Promise<unknown> }).bulk = () =>
      Promise.resolve({
        body: { errors: true, items: [{ index: { error: 'mapper_parsing' } }] },
      });

    await expect(failing.indexer.reindexAll()).rejects.toThrow(/not promoted/);
    expect(failing.aliasTargetNow()).toBe(UNIT_INDEX_V2);
  });

  it('names a fresh version so the exact-coordinate indexes cannot be current', () => {
    expect(UNIT_INDEX_CURRENT).not.toBe(UNIT_INDEX_V2);
    expect(UNIT_ALIAS).toBe('units');
  });
});
