/**
 * Unit index definition. We use a VERSIONED physical index behind a stable
 * alias (`units` -> `units_v1`): reindexing builds a fresh physical index and
 * atomically flips the alias, so search never sees a half-built index and
 * mapping changes never require downtime.
 */
export const UNIT_ALIAS = 'units';
export const UNIT_INDEX_V1 = 'units_v1';

export const unitIndexBody = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0, // dev single-node; managed domain overrides
    analysis: {
      analyzer: {
        // Folds accents/case so "villa" matches "Villá"; edge n-grams power
        // as-you-type. Arabic-specific analysis is a later enhancement.
        lc_text: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
        },
      },
    },
  },
  mappings: {
    properties: {
      unitId: { type: 'keyword' },
      propertyId: { type: 'keyword' },
      hostId: { type: 'keyword' },
      unitName: { type: 'text', analyzer: 'lc_text' },
      propertyName: { type: 'text', analyzer: 'lc_text' },
      propertyType: { type: 'keyword' },
      unitType: { type: 'keyword' },
      city: { type: 'keyword' },
      countryCode: { type: 'keyword' },
      location: { type: 'geo_point' },
      supportsHourly: { type: 'boolean' },
      supportsNightly: { type: 'boolean' },
      maxGuests: { type: 'integer' },
      currency: { type: 'keyword' },
      hourlyRateMinor: { type: 'long' },
      nightlyRateMinor: { type: 'long' },
      amenities: { type: 'keyword' },
      ratingAvg: { type: 'half_float' },
      ratingCount: { type: 'integer' },
      instantBook: { type: 'boolean' },
      indexedAt: { type: 'date' },
    },
  },
} as const;
