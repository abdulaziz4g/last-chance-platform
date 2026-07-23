import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateDealInput,
  FlashDeal,
  FlashDealStatus,
  FlashDealView,
} from '../domain/types';

interface DealRow {
  id: string;
  unit_id: string;
  created_by: string;
  title: string;
  discount_pct: number;
  status: FlashDealStatus;
  starts_at: Date;
  ends_at: Date;
  applicable_stay_from: Date | null;
  applicable_stay_to: Date | null;
  quantity_total: number;
  quantity_claimed: number;
  created_at: Date;
  updated_at: Date;
}

const COLS = `
  id, unit_id, created_by, title, discount_pct, status::text AS status,
  starts_at, ends_at,
  lower(applicable_stay_range) AS applicable_stay_from,
  upper(applicable_stay_range) AS applicable_stay_to,
  quantity_total, quantity_claimed, created_at, updated_at`;

@Injectable()
export class DealRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: CreateDealInput): Promise<FlashDeal> {
    const stayRange =
      input.applicableStayFrom && input.applicableStayTo
        ? `tstzrange($9::timestamptz, $10::timestamptz, '[)')`
        : `NULL`;
    const params: unknown[] = [
      input.unitId,
      input.createdBy, // NULL -> resolved to the unit's owning host below
      input.title,
      input.discountPct,
      input.startsAt,
      input.endsAt,
      input.quantityTotal,
      // status: starts ACTIVE if the window is already open, else SCHEDULED.
      input.startsAt.getTime() <= Date.now() ? 'ACTIVE' : 'SCHEDULED',
    ];
    if (input.applicableStayFrom && input.applicableStayTo) {
      params.push(input.applicableStayFrom, input.applicableStayTo);
    }
    const res = await this.db.query<DealRow>(
      `INSERT INTO flash_deals
         (unit_id, created_by, title, discount_pct, starts_at, ends_at,
          quantity_total, status, applicable_stay_range)
       VALUES (
         $1,
         COALESCE($2::uuid, (
           SELECT p.host_id FROM units u
           JOIN properties p ON p.id = u.property_id
           WHERE u.id = $1
         )),
         $3, $4, $5, $6, $7, $8::flash_deal_status, ${stayRange})
       RETURNING ${COLS}`,
      params,
    );
    return toDeal(res.rows[0]);
  }

  async findById(id: string): Promise<FlashDeal | null> {
    const res = await this.db.query<DealRow>(
      `SELECT ${COLS} FROM flash_deals WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? toDeal(res.rows[0]) : null;
  }

  /**
   * THE ATOMIC CLAIM. Runs inside the caller's booking transaction.
   * `quantity_claimed < quantity_total` + `RETURNING` means the DB decides
   * winners: concurrent claims serialize on the row lock, over-claiming is
   * impossible, and 0 rows returned == sold out. The SOLD_OUT auto-flip
   * trigger (migration 0008) sets status when the last unit is taken.
   */
  async tryClaim(client: PoolClient, dealId: string): Promise<number | null> {
    const res = await client.query<{ quantity_claimed: number }>(
      `UPDATE flash_deals
         SET quantity_claimed = quantity_claimed + 1
       WHERE id = $1
         AND status = 'ACTIVE'
         AND quantity_claimed < quantity_total
       RETURNING quantity_claimed`,
      [dealId],
    );
    return res.rows[0]?.quantity_claimed ?? null;
  }

  /** Active, currently-claimable deals joined to their unit/property. */
  async listActive(limit: number): Promise<FlashDealView[]> {
    const res = await this.db.query<
      DealRow & {
        property_id: string;
        property_name: string;
        unit_name: string;
        city: string;
        currency: string;
        base_hourly_rate_minor: number | null;
        base_nightly_rate_minor: number | null;
      }
    >(
      // Columns are d.-qualified here: the join makes a bare `id` ambiguous.
      `SELECT d.id, d.unit_id, d.created_by, d.title, d.discount_pct,
              d.status::text AS status, d.starts_at, d.ends_at,
              lower(d.applicable_stay_range) AS applicable_stay_from,
              upper(d.applicable_stay_range) AS applicable_stay_to,
              d.quantity_total, d.quantity_claimed, d.created_at, d.updated_at,
              p.id AS property_id, p.name AS property_name, u.name AS unit_name,
              p.city, u.currency,
              u.base_hourly_rate_minor, u.base_nightly_rate_minor
       FROM flash_deals d
       JOIN units u ON u.id = d.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE d.status = 'ACTIVE'
         AND now() >= d.starts_at AND now() < d.ends_at
         AND d.quantity_claimed < d.quantity_total
         AND u.status = 'ACTIVE' AND p.status = 'ACTIVE'
       ORDER BY d.ends_at ASC
       LIMIT $1`,
      [limit],
    );
    const now = Date.now();
    return res.rows.map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      propertyId: r.property_id,
      propertyName: r.property_name,
      unitName: r.unit_name,
      city: r.city,
      title: r.title,
      discountPct: r.discount_pct,
      status: r.status,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      quantityTotal: r.quantity_total,
      quantityClaimed: r.quantity_claimed,
      quantityRemaining: r.quantity_total - r.quantity_claimed,
      currency: r.currency,
      baseHourlyRateMinor: r.base_hourly_rate_minor,
      baseNightlyRateMinor: r.base_nightly_rate_minor,
      secondsRemaining: Math.max(
        0,
        Math.round((r.ends_at.getTime() - now) / 1000),
      ),
    }));
  }

  /** Lifecycle sweeps (called by the scheduler worker). Return affected ids. */
  async activateDue(): Promise<string[]> {
    const res = await this.db.query<{ id: string }>(
      `UPDATE flash_deals SET status = 'ACTIVE'
       WHERE status = 'SCHEDULED' AND now() >= starts_at AND now() < ends_at
       RETURNING id`,
    );
    return res.rows.map((r) => r.id);
  }

  async endExpired(): Promise<string[]> {
    const res = await this.db.query<{ id: string }>(
      `UPDATE flash_deals SET status = 'ENDED'
       WHERE status IN ('SCHEDULED', 'ACTIVE') AND now() >= ends_at
       RETURNING id`,
    );
    return res.rows.map((r) => r.id);
  }
}

const toDeal = (r: DealRow): FlashDeal => ({
  id: r.id,
  unitId: r.unit_id,
  createdBy: r.created_by,
  title: r.title,
  discountPct: r.discount_pct,
  status: r.status,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  applicableStayFrom: r.applicable_stay_from,
  applicableStayTo: r.applicable_stay_to,
  quantityTotal: r.quantity_total,
  quantityClaimed: r.quantity_claimed,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
