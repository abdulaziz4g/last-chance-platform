import { buildSearchBody } from '../src/modules/search/infrastructure/query-builder';
import type { SearchQuery } from '../src/modules/search/domain/types';

type Bool = {
  bool: { must: Record<string, unknown>[]; filter: Record<string, unknown>[] };
};

function boolOf(body: Record<string, unknown>): Bool['bool'] {
  return (body.query as Bool).bool;
}

describe('buildSearchBody', () => {
  it('defaults to match_all with pagination and facets', () => {
    const body = buildSearchBody({});
    expect(boolOf(body).must).toEqual([{ match_all: {} }]);
    expect(body.from).toBe(0);
    expect(body.size).toBe(20);
    expect(body.aggs).toHaveProperty('propertyType');
    expect(body.aggs).toHaveProperty('amenities');
    expect(body.aggs).toHaveProperty('city');
  });

  it('adds a fuzzy multi_match for text', () => {
    const body = buildSearchBody({ text: 'riyadh villa' });
    const must = boolOf(body).must[0] as { multi_match: { fuzziness: string } };
    expect(must.multi_match.fuzziness).toBe('AUTO');
  });

  it('translates mode, guests, instant-book and amenity AND filters', () => {
    const q: SearchQuery = {
      mode: 'HOURLY',
      guests: 3,
      instantBookOnly: true,
      amenities: ['wifi', 'pool'],
    };
    const filter = boolOf(buildSearchBody(q)).filter;
    expect(filter).toContainEqual({ term: { supportsHourly: true } });
    expect(filter).toContainEqual({ range: { maxGuests: { gte: 3 } } });
    expect(filter).toContainEqual({ term: { instantBook: true } });
    // AND semantics: one term filter per amenity
    expect(filter).toContainEqual({ term: { amenities: 'wifi' } });
    expect(filter).toContainEqual({ term: { amenities: 'pool' } });
  });

  it('prices against the mode-appropriate rate field', () => {
    const hourly = boolOf(
      buildSearchBody({ mode: 'HOURLY', minPriceMinor: 5000, maxPriceMinor: 20000 }),
    ).filter;
    expect(hourly).toContainEqual({
      range: { hourlyRateMinor: { gte: 5000, lte: 20000 } },
    });
    const nightly = boolOf(
      buildSearchBody({ mode: 'NIGHTLY', maxPriceMinor: 90000 }),
    ).filter;
    expect(nightly).toContainEqual({
      range: { nightlyRateMinor: { lte: 90000 } },
    });
  });

  it('builds a geo_distance filter and distance-aware sort', () => {
    const body = buildSearchBody({
      lat: 24.71,
      lon: 46.67,
      radiusKm: 10,
      sort: 'distance',
    });
    const filter = boolOf(body).filter;
    expect(filter).toContainEqual({
      geo_distance: { distance: '10km', location: { lat: 24.71, lon: 46.67 } },
    });
    const sort = body.sort as Record<string, unknown>[];
    expect(sort[0]).toHaveProperty('_geo_distance');
  });

  it('sorts by price ascending when requested', () => {
    const body = buildSearchBody({ mode: 'NIGHTLY', sort: 'price_asc' });
    expect(body.sort).toEqual([
      { nightlyRateMinor: { order: 'asc', missing: '_last' } },
    ]);
  });
});
