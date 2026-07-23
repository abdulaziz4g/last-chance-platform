# Search & Discovery (OpenSearch)

Geo-spatial + faceted discovery over a denormalized unit index, with a
PostgreSQL availability post-filter so search can never contradict the booking
engine.

## The two-stage design (the load-bearing decision)

```
POST /search/units
  │
  ├─ STAGE 1  OpenSearch  (infrastructure/query-builder.ts → application/search.service.ts)
  │     bool: must(full-text multi_match, fuzzy) + filter(mode, guests, price,
  │     amenities AND, geo_distance) · aggs(propertyType, amenities, city)
  │     · sort(relevance | price | rating | distance) · pagination
  │        ↓ candidate unit ids
  └─ STAGE 2  PostgreSQL  (only when checkInUtc/checkOutUtc supplied)
        NOT EXISTS overlapping booking (PENDING_PAYMENT|CONFIRMED|CHECKED_IN)
        AND NOT EXISTS overlapping host block — using fn_booking_block_range
        with each unit's turnaround buffer: the SAME predicate the exclusion
        constraint enforces. Unavailable units are dropped; survivors flagged
        available:true.
```

**Why availability is not indexed:** it changes every second and PostgreSQL's
GIST exclusion constraint is its only source of truth. Indexing it would let
search show a slot as free that booking would reject. OpenSearch narrows the
field fast; Postgres has the final word — the same discipline as every other
phase.

## Index

- Versioned physical index `units_v1` behind stable alias `units` — reindex
  builds fresh + flips the alias atomically (no downtime, no half-built reads).
- Document = denormalized unit + property projection (`ST_Y/ST_X` → geo_point,
  amenities, rates, rating). Only ACTIVE units of ACTIVE properties are indexed.
- `UnitIndexer`: `reindexAll()` (bulk), `indexUnit()`/`removeUnit()`
  (incremental upsert/evict on unit/property/review changes). The index is a
  rebuildable read model — losing it is one `POST /search/reindex` away.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /search/units` | public | Discovery via query string |
| `POST /search/units` | public | Discovery via JSON body (amenity arrays) |
| `POST /search/reindex` | ADMIN | Full rebuild from PostgreSQL |

## Resilience

- Client timeout 5s, 2 retries; a search-cluster outage returns empty results,
  never blocks the request thread, and never affects booking.
- Index bootstrap at app start is non-fatal (search degrades, API serves on).

## Verified (live smoke — `npm run smoke:search`)

13/13: reindex, geo radius (Riyadh 50 km → exactly the Riyadh units, distances
computed), text + wide radius reaching Jeddah, hourly price ceiling, amenity
facet + AND filter, and the two-stage proof — a confirmed booking is dropped
from a windowed search for its window, present for a non-overlapping window,
and still listed by plain (windowless) search; plus incremental eviction of a
deactivated unit.
