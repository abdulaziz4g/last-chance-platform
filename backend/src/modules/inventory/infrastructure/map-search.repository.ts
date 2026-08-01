import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import type { MapPin, MapSearchQuery } from '../domain/map-types';

interface PinRow {
  unit_id: string;
  property_id: string;
  unit_name: string;
  property_name: string;
  property_slug: string;
  property_type: string;
  city: string;
  district: string | null;
  unit_type: string;
  max_guests: number;
  currency: string;
  rating_avg: string | null;
  rating_count: number;
  photos: unknown;
  lat: number;
  lng: number;
  base_price_minor: string;
  effective_price_minor: string;
  deal_id: string | null;
  deal_discount_pct: string | null;
  deal_ends_at: Date | null;
}

/**
 * Viewport (bounding-box) search over PostGIS.
 *
 * Reads v_public_units, never the base tables. That view is the single
 * expression of "approved, active, not deleted" — going around it is how an
 * unapproved listing ends up on the public map.
 *
 * COORDINATES ARE THE APPROXIMATE ONES. v_public_units exposes both
 * approx_location and exact_location; map search deliberately selects the
 * former, so a scraper reading this endpoint never learns where a property
 * actually is. The exact point is revealed only after a booking is confirmed,
 * through a different code path.
 */
@Injectable()
export class MapSearchRepository {
  constructor(private readonly db: DatabaseService) {}

  async search(q: MapSearchQuery): Promise<MapPin[]> {
    const hourly = q.bookingType === 'HOURLY';

    const res = await this.db.query<PinRow>(
      `
      WITH viewport AS (
        SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography AS box
      )
      SELECT v.unit_id,
             v.property_id,
             v.unit_name,
             v.property_name,
             v.property_slug,
             v.property_type::text,
             v.city,
             v.district,
             v.unit_type::text,
             v.max_guests,
             v.currency,
             v.rating_avg::text,
             v.rating_count,
             v.photos,
             ST_Y(v.approx_location::geometry) AS lat,
             ST_X(v.approx_location::geometry) AS lng,
             rate.base_minor::text AS base_price_minor,
             price.effective_minor::text AS effective_price_minor,
             d.id           AS deal_id,
             d.discount_pct::text AS deal_discount_pct,
             d.ends_at      AS deal_ends_at
        FROM v_public_units v
        CROSS JOIN viewport vp
        -- The mode's rate, named once. It is needed by the select, by the
        -- "this unit has a price at all" guard and by the effective-price
        -- calculation, and three spellings of one CASE is three chances for
        -- them to disagree about which rate the pin is describing.
        CROSS JOIN LATERAL (
              SELECT (CASE WHEN $5::boolean THEN v.base_hourly_rate_minor
                           ELSE v.base_nightly_rate_minor END) AS base_minor
        ) rate
        -- Deal join is LATERAL so "the one live deal for this unit" is decided
        -- per row; flash_deals already forbids overlapping live deals per unit,
        -- so LIMIT 1 is belt to that suspenders.
        LEFT JOIN LATERAL (
              SELECT fd.id, fd.discount_pct, fd.ends_at
                FROM flash_deals fd
               WHERE fd.unit_id = v.unit_id
                 AND fd.status = 'ACTIVE'
                 AND fd.active_range @> now()
                 AND fd.quantity_claimed < fd.quantity_total
               ORDER BY fd.discount_pct DESC
               LIMIT 1
        ) d ON true
        -- A live deal changes the number ON the pin, not just the styling:
        -- showing the undiscounted price next to a "deal" badge is the kind of
        -- detail that reads as dishonest. Named here so the price filter below
        -- and the figure the guest sees are the same expression by
        -- construction, not by two authors keeping them in step.
        CROSS JOIN LATERAL (
              SELECT round(
                       rate.base_minor * (1 - COALESCE(d.discount_pct, 0) / 100.0)
                     )::bigint AS effective_minor
        ) price
       WHERE ST_Intersects(v.approx_location, vp.box)
         AND ($5::boolean IS false OR v.supports_hourly)
         AND ($5::boolean IS true  OR v.supports_nightly)
         AND rate.base_minor IS NOT NULL
         AND ($6::smallint IS NULL OR v.max_guests >= $6)
         -- Bounds apply to the discounted price, matching what the pin shows.
         AND ($10::bigint IS NULL OR price.effective_minor >= $10)
         AND ($11::bigint IS NULL OR price.effective_minor <= $11)
         -- Availability. Both checks use fn_booking_block_range with the
         -- unit's own turnaround, so search agrees exactly with the EXCLUDE
         -- constraint that will arbitrate the booking. A pin the guest cannot
         -- actually book is worse than no pin.
         AND ($7::timestamptz IS NULL OR NOT EXISTS (
               SELECT 1 FROM bookings b
                WHERE b.unit_id = v.unit_id
                  AND b.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
                  AND b.block_range && fn_booking_block_range(
                        $7::timestamptz, $8::timestamptz, v.turnaround_minutes)
         ))
         AND ($7::timestamptz IS NULL OR NOT EXISTS (
               SELECT 1 FROM unit_availability_blocks ab
                WHERE ab.unit_id = v.unit_id
                  AND ab.is_active
                  AND ab.block_range && fn_booking_block_range(
                        $7::timestamptz, $8::timestamptz, v.turnaround_minutes)
         ))
       ORDER BY (d.id IS NOT NULL) DESC, v.rating_avg DESC NULLS LAST
       LIMIT $9
      `,
      [
        q.minLng,
        q.minLat,
        q.maxLng,
        q.maxLat,
        hourly,
        q.guests ?? null,
        q.checkInUtc ?? null,
        q.checkOutUtc ?? null,
        q.limit,
        q.minPriceMinor ?? null,
        q.maxPriceMinor ?? null,
      ],
    );

    return res.rows.map((r) => ({
      unitId: r.unit_id,
      propertyId: r.property_id,
      unitName: r.unit_name,
      propertyName: r.property_name,
      propertySlug: r.property_slug,
      propertyType: r.property_type,
      unitType: r.unit_type,
      city: r.city,
      district: r.district,
      maxGuests: r.max_guests,
      currency: r.currency,
      ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
      ratingCount: r.rating_count,
      photos: Array.isArray(r.photos) ? (r.photos as unknown[]) : [],
      // The privacy circle the client draws. Radius is fixed and published so
      // the UI cannot accidentally imply more precision than exists.
      approxLat: r.lat,
      approxLng: r.lng,
      privacyRadiusMetres: 500,
      basePriceMinor: Number(r.base_price_minor),
      priceMinor: Number(r.effective_price_minor),
      bookingType: q.bookingType,
      deal:
        r.deal_id === null
          ? null
          : {
              dealId: r.deal_id,
              discountPct: Number(r.deal_discount_pct),
              endsAt: r.deal_ends_at,
            },
    }));
  }
}
