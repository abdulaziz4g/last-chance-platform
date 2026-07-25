import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import type {
  UnitDetail,
  UnitDetailDeal,
  UnitReview,
} from '../domain/types';

interface DetailRow {
  unit_id: string;
  unit_name: string;
  unit_type: string;
  unit_status: string;
  supports_hourly: boolean;
  supports_nightly: boolean;
  max_guests: number;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: string | null;
  area_sqm: string | null;
  currency: string;
  hourly_rate_minor: number | null;
  nightly_rate_minor: number | null;
  min_hourly_duration_minutes: number;
  turnaround_minutes: number;
  instant_book: boolean;
  photos: unknown;

  property_id: string;
  property_name: string;
  slug: string;
  description: string | null;
  property_type: string;
  city: string;
  country_code: string;
  address_line1: string | null;
  timezone: string;
  lat: number;
  lon: number;
  amenities: unknown;
  policies: unknown;
  default_check_in_time: string;
  default_check_out_time: string;
  property_rating_avg: string | null;
  property_rating_count: number;

  host_id: string;
  host_display_name: string;
  host_bio: string | null;
  is_superhost: boolean;
  host_rating_avg: string | null;
  host_rating_count: number;
}

interface ReviewRow {
  id: string;
  overall_rating: number;
  comment: string | null;
  host_reply: string | null;
  created_at: Date;
  author_name: string;
}

interface DealRow {
  id: string;
  title: string;
  discount_pct: number;
  ends_at: Date;
  quantity_remaining: number;
}

/** numeric columns arrive as strings from pg; keep null distinct from 0. */
const num = (v: string | null): number | null => (v == null ? null : Number(v));

@Injectable()
export class UnitRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Public detail lookup. Mirrors the search indexer's visibility rule — only
   * ACTIVE, undeleted units on ACTIVE, undeleted properties are addressable,
   * so a delisted unit 404s rather than leaking a private listing.
   */
  async findPublicDetail(unitId: string): Promise<UnitDetail | null> {
    const res = await this.db.query<DetailRow>(
      `SELECT u.id                          AS unit_id,
              u.name                        AS unit_name,
              u.unit_type::text             AS unit_type,
              u.status::text                AS unit_status,
              u.supports_hourly, u.supports_nightly, u.max_guests,
              u.bedrooms, u.beds, u.bathrooms, u.area_sqm, u.currency,
              u.base_hourly_rate_minor      AS hourly_rate_minor,
              u.base_nightly_rate_minor     AS nightly_rate_minor,
              u.min_hourly_duration_minutes, u.turnaround_minutes,
              u.instant_book, u.photos,

              p.id                          AS property_id,
              p.name                        AS property_name,
              p.slug, p.description,
              p.property_type::text         AS property_type,
              p.city, p.country_code, p.address_line1, p.timezone,
              ST_Y(p.location::geometry)    AS lat,
              ST_X(p.location::geometry)    AS lon,
              p.amenities, p.policies,
              p.default_check_in_time::text  AS default_check_in_time,
              p.default_check_out_time::text AS default_check_out_time,
              p.rating_avg                  AS property_rating_avg,
              p.rating_count                AS property_rating_count,

              h.user_id                     AS host_id,
              h.display_name                AS host_display_name,
              h.bio                         AS host_bio,
              h.is_superhost,
              h.rating_avg                  AS host_rating_avg,
              h.rating_count                AS host_rating_count
         FROM units u
         JOIN properties p     ON p.id = u.property_id
         JOIN host_profiles h  ON h.user_id = p.host_id
        WHERE u.id = $1
          AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND p.status = 'ACTIVE' AND p.deleted_at IS NULL`,
      [unitId],
    );

    const r = res.rows[0];
    if (!r) return null;

    const [reviews, activeDeal] = await Promise.all([
      this.listReviews(r.property_id),
      this.findActiveDeal(unitId),
    ]);

    return {
      unit: {
        id: r.unit_id,
        name: r.unit_name,
        unitType: r.unit_type,
        status: r.unit_status,
        supportsHourly: r.supports_hourly,
        supportsNightly: r.supports_nightly,
        maxGuests: r.max_guests,
        bedrooms: r.bedrooms,
        beds: r.beds,
        bathrooms: num(r.bathrooms),
        areaSqm: num(r.area_sqm),
        currency: r.currency,
        hourlyRateMinor: r.hourly_rate_minor,
        nightlyRateMinor: r.nightly_rate_minor,
        minHourlyDurationMinutes: r.min_hourly_duration_minutes,
        turnaroundMinutes: r.turnaround_minutes,
        instantBook: r.instant_book,
        photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
      },
      property: {
        id: r.property_id,
        name: r.property_name,
        slug: r.slug,
        description: r.description,
        propertyType: r.property_type,
        city: r.city,
        countryCode: r.country_code,
        addressLine1: r.address_line1,
        timezone: r.timezone,
        lat: r.lat,
        lon: r.lon,
        amenities: Array.isArray(r.amenities) ? (r.amenities as string[]) : [],
        policies:
          r.policies && typeof r.policies === 'object'
            ? (r.policies as Record<string, unknown>)
            : {},
        defaultCheckInTime: r.default_check_in_time,
        defaultCheckOutTime: r.default_check_out_time,
        ratingAvg: num(r.property_rating_avg),
        ratingCount: r.property_rating_count,
      },
      host: {
        id: r.host_id,
        displayName: r.host_display_name,
        bio: r.host_bio,
        isSuperhost: r.is_superhost,
        ratingAvg: num(r.host_rating_avg),
        ratingCount: r.host_rating_count,
      },
      reviews,
      activeDeal,
    };
  }

  /** Published reviews only, newest first. Reviews attach to the property. */
  private async listReviews(
    propertyId: string,
    limit = 10,
  ): Promise<UnitReview[]> {
    const res = await this.db.query<ReviewRow>(
      `SELECT r.id, r.overall_rating, r.comment, r.host_reply, r.created_at,
              -- First name only: the full name is not ours to publish.
              split_part(u.full_name, ' ', 1) AS author_name
         FROM reviews r
         JOIN users u ON u.id = r.author_id
        WHERE r.property_id = $1 AND r.status = 'PUBLISHED'
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [propertyId, limit],
    );

    return res.rows.map((r) => ({
      id: r.id,
      overallRating: r.overall_rating,
      comment: r.comment,
      hostReply: r.host_reply,
      createdAt: r.created_at,
      authorName: r.author_name || 'Guest',
    }));
  }

  private async findActiveDeal(unitId: string): Promise<UnitDetailDeal | null> {
    const res = await this.db.query<DealRow>(
      `SELECT id, title, discount_pct, ends_at,
              (quantity_total - quantity_claimed) AS quantity_remaining
         FROM flash_deals
        WHERE unit_id = $1
          AND status = 'ACTIVE'
          AND starts_at <= now() AND ends_at > now()
          AND quantity_claimed < quantity_total
        ORDER BY discount_pct DESC
        LIMIT 1`,
      [unitId],
    );

    const d = res.rows[0];
    return d
      ? {
          id: d.id,
          title: d.title,
          discountPct: d.discount_pct,
          endsAt: d.ends_at,
          quantityRemaining: d.quantity_remaining,
        }
      : null;
  }
}
