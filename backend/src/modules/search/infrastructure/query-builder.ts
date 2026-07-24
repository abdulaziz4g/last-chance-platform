import { SearchQuery } from '../domain/types';

/**
 * Translates a validated SearchQuery into an OpenSearch request body.
 * Kept pure (no client, no IO) so it is unit-testable in isolation.
 *
 * Structure: a bool query with must (full-text relevance) + filter (exact,
 * non-scoring constraints: mode, guests, price, amenities, geo). Facets are
 * aggregations over the filtered set. Price sorting keys off the relevant
 * rate for the requested mode.
 */
export function buildSearchBody(q: SearchQuery): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];

  if (q.text && q.text.trim().length > 0) {
    must.push({
      multi_match: {
        query: q.text,
        fields: [
          'propertyName^2',
          'propertyName.ar^2',
          'unitName',
          'unitName.ar',
          'cityText^1.5',
          'cityText.ar^1.5',
        ],
        fuzziness: 'AUTO',
      },
    });
  }

  if (q.mode === 'HOURLY') filter.push({ term: { supportsHourly: true } });
  if (q.mode === 'NIGHTLY') filter.push({ term: { supportsNightly: true } });
  if (q.city) filter.push({ term: { city: q.city } });
  if (q.guests) filter.push({ range: { maxGuests: { gte: q.guests } } });
  if (q.instantBookOnly) filter.push({ term: { instantBook: true } });

  if (q.amenities && q.amenities.length > 0) {
    // AND semantics — every requested amenity must be present.
    for (const amenity of q.amenities) {
      filter.push({ term: { amenities: amenity } });
    }
  }

  const priceField = q.mode === 'HOURLY' ? 'hourlyRateMinor' : 'nightlyRateMinor';
  if (q.minPriceMinor != null || q.maxPriceMinor != null) {
    const range: Record<string, number> = {};
    if (q.minPriceMinor != null) range.gte = q.minPriceMinor;
    if (q.maxPriceMinor != null) range.lte = q.maxPriceMinor;
    filter.push({ range: { [priceField]: range } });
  }

  const hasGeo = q.lat != null && q.lon != null;
  if (hasGeo) {
    filter.push({
      geo_distance: {
        distance: `${q.radiusKm ?? 25}km`,
        location: { lat: q.lat, lon: q.lon },
      },
    });
  }

  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;

  const body: Record<string, unknown> = {
    from: (page - 1) * pageSize,
    size: pageSize,
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    aggs: {
      propertyType: { terms: { field: 'propertyType', size: 20 } },
      amenities: { terms: { field: 'amenities', size: 40 } },
      city: { terms: { field: 'city', size: 30 } },
    },
    sort: buildSort(q, hasGeo, priceField),
  };

  return body;
}

function buildSort(
  q: SearchQuery,
  hasGeo: boolean,
  priceField: string,
): unknown[] {
  switch (q.sort) {
    case 'price_asc':
      return [{ [priceField]: { order: 'asc', missing: '_last' } }];
    case 'price_desc':
      return [{ [priceField]: { order: 'desc', missing: '_last' } }];
    case 'rating':
      return [{ ratingAvg: { order: 'desc', missing: '_last' } }];
    case 'distance':
      if (hasGeo) {
        return [
          {
            _geo_distance: {
              location: { lat: q.lat, lon: q.lon },
              order: 'asc',
              unit: 'km',
            },
          },
        ];
      }
      return ['_score'];
    default:
      // Relevance, but distance-aware when a geo anchor is present.
      return hasGeo
        ? [
            '_score',
            {
              _geo_distance: {
                location: { lat: q.lat, lon: q.lon },
                order: 'asc',
                unit: 'km',
              },
            },
          ]
        : ['_score'];
  }
}
