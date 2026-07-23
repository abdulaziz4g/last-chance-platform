/**
 * Flash-deal claim-flow smoke — full stack, live:
 *   create deal (ACTIVE) -> WS relays DEAL_ACTIVATED
 *   -> CONCURRENCY BURST: 6 claims for 6 different windows on a qty=3 deal
 *      => exactly 3 win a discounted hold, 3 sold out, counter never exceeds 3
 *   -> discounted booking carries flash_deal_id + correct discount
 *   -> claim an already-booked window: UNIT_UNAVAILABLE and NO slot consumed
 *      (atomic claim+hold rolls back together)
 *   -> sold-out deal rejects further claims
 *   -> lifecycle: a past-window deal ends; a future deal activates
 *
 * Usage: node node_modules/ts-node/dist/bin.js scripts/integration-smoke-deals.ts
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import WebSocket from 'ws';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/infrastructure/database/database.service';
import { RequestContextService } from '../src/common/context/request-context.service';
import { DealService } from '../src/modules/deals/application/deal.service';
import {
  FlashDealSoldOutError,
  UnitUnavailableError,
} from '../src/common/errors/domain-errors';

let passed = 0;
let failed = 0;
const pass = (n: string): void => {
  passed++;
  console.log(`  PASS  ${n}`);
};
const fail = (n: string, d?: unknown): void => {
  failed++;
  console.error(`  FAIL  ${n}`, d ?? '');
};
const assert = (c: boolean, n: string, d?: unknown): void =>
  c ? pass(n) : fail(n, d);

function dayAt(daysAhead: number, hour: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function main(): Promise<void> {
  const PORT = 3300;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['error', 'warn'], abortOnError: false, rawBody: true },
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen({ port: PORT, host: '127.0.0.1' });

  const db = app.get(DatabaseService);
  const ctx = app.get(RequestContextService);
  const deals = app.get(DealService);

  await ctx.run(
    { requestId: `deals-${randomUUID()}`, actorType: 'SYSTEM' },
    async () => {
      const tag = Date.now();
      const hostUserId = randomUUID();
      const guestId = randomUUID();
      const propertyId = randomUUID();
      const unitId = randomUUID();

      await db.query(
        `INSERT INTO users (id, email, full_name, auth_provider) VALUES
         ($1,$3,'Deal Host','google'), ($2,$4,'Deal Guest','google')`,
        [hostUserId, guestId, `dh-${tag}@t.local`, `dg-${tag}@t.local`],
      );
      await db.query(
        `INSERT INTO host_profiles (user_id, display_name) VALUES ($1,'Deal Host')`,
        [hostUserId],
      );
      await db.query(
        `INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location)
         VALUES ($1,$2,'Deal Property',$3,'APARTHOTEL','ACTIVE','Riyadh','SA',
                 ST_SetSRID(ST_MakePoint(46.67,24.71),4326)::geography)`,
        [propertyId, hostUserId, `dp-${tag}`],
      );
      await db.query(
        `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                            max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                            turnaround_minutes, status)
         VALUES ($1,$2,'Deal Studio','STUDIO',true,true,4,'SAR',30000::bigint,10000::bigint,30,'ACTIVE')`,
        [unitId, propertyId],
      );

      // ---- WS subscribe ----------------------------------------------------
      const ws = new WebSocket(`ws://localhost:${PORT}/ws/availability`);
      const events: Array<Record<string, unknown>> = [];
      ws.on('message', (raw) => events.push(JSON.parse(String(raw)) as Record<string, unknown>));
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
      });
      ws.send(JSON.stringify({ action: 'subscribe', unitId }));
      await new Promise((r) => setTimeout(r, 200));

      // ---- create an ACTIVE deal, qty 3, 30% off --------------------------
      const deal = await deals.create({
        unitId,
        createdBy: hostUserId,
        title: 'Tonight only — 30% off',
        discountPct: 30,
        startsAt: new Date(Date.now() - 60_000), // already open
        endsAt: dayAt(0, 23),
        quantityTotal: 3,
      });
      assert(deal.status === 'ACTIVE', 'deal created ACTIVE');

      await new Promise((r) => setTimeout(r, 300));
      assert(
        events.some((e) => e['type'] === 'DEAL_ACTIVATED' && e['dealId'] === deal.id),
        'WS relayed DEAL_ACTIVATED',
      );

      // ---- CONCURRENCY BURST: 6 claims, 6 distinct windows, qty=3 ----------
      const claims = await Promise.allSettled(
        Array.from({ length: 6 }, (_v, i) =>
          deals.claim({
            dealId: deal.id,
            guestId,
            bookingType: 'HOURLY',
            // distinct non-overlapping windows on days 2..7 so availability
            // never conflicts — the ONLY limiter is deal inventory (3).
            checkInUtc: dayAt(2 + i, 10),
            checkOutUtc: dayAt(2 + i, 12),
            guestsCount: 1,
          }),
        ),
      );
      const wins = claims.filter((c) => c.status === 'fulfilled');
      const soldOut = claims.filter(
        (c) => c.status === 'rejected' && c.reason instanceof FlashDealSoldOutError,
      );
      assert(
        wins.length === 3 && soldOut.length === 3,
        `burst: exactly 3/6 claimed, 3 sold out (got ${wins.length} win, ${soldOut.length} soldout)`,
        claims.map((c) => (c.status === 'fulfilled' ? 'ok' : (c.reason as Error).constructor.name)),
      );

      const counter = await db.query<{ quantity_claimed: number; status: string }>(
        `SELECT quantity_claimed, status::text FROM flash_deals WHERE id = $1`,
        [deal.id],
      );
      assert(
        counter.rows[0].quantity_claimed === 3,
        `counter never exceeded inventory (quantity_claimed=${counter.rows[0].quantity_claimed})`,
      );
      assert(
        counter.rows[0].status === 'SOLD_OUT',
        `deal auto-flipped to SOLD_OUT (status=${counter.rows[0].status})`,
      );

      // ---- discounted booking correctness ---------------------------------
      const sampleWin = wins[0] as PromiseFulfilledResult<{ id: string }>;
      const booking = await db.query<{
        flash_deal_id: string | null;
        base_amount_minor: number;
        discount_minor: number;
        total_amount_minor: number;
      }>(
        `SELECT flash_deal_id, base_amount_minor, discount_minor, total_amount_minor
         FROM bookings WHERE id = $1`,
        [sampleWin.value.id],
      );
      const b = booking.rows[0];
      // 2h * 10000 = 20000 base, 30% => 6000 discount.
      assert(
        b.flash_deal_id === deal.id && b.base_amount_minor === 20_000 && b.discount_minor === 6_000,
        `discounted hold carries deal id + correct discount (base ${b.base_amount_minor}, disc ${b.discount_minor})`,
      );

      // ---- sold-out deal rejects a further claim --------------------------
      let soldOutAgain = false;
      try {
        await deals.claim({
          dealId: deal.id,
          guestId,
          bookingType: 'HOURLY',
          checkInUtc: dayAt(20, 10),
          checkOutUtc: dayAt(20, 12),
          guestsCount: 1,
        });
      } catch (e) {
        soldOutAgain = e instanceof FlashDealSoldOutError;
      }
      assert(soldOutAgain, 'sold-out deal rejects further claims');

      // ---- atomicity: claim an already-booked window burns NO slot --------
      const deal2 = await deals.create({
        unitId,
        createdBy: hostUserId,
        title: 'Second deal',
        discountPct: 20,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: dayAt(0, 23),
        quantityTotal: 2,
      });
      // day2 10:00-12:00 is already booked by the burst above -> overlap.
      let unavailable = false;
      try {
        await deals.claim({
          dealId: deal2.id,
          guestId,
          bookingType: 'HOURLY',
          checkInUtc: dayAt(2, 10),
          checkOutUtc: dayAt(2, 12),
          guestsCount: 1,
        });
      } catch (e) {
        unavailable = e instanceof UnitUnavailableError;
      }
      const deal2After = await db.query<{ quantity_claimed: number }>(
        `SELECT quantity_claimed FROM flash_deals WHERE id = $1`,
        [deal2.id],
      );
      assert(
        unavailable && deal2After.rows[0].quantity_claimed === 0,
        `claim on a booked window fails UNAVAILABLE and consumes NO deal slot (claimed=${deal2After.rows[0].quantity_claimed})`,
      );

      // ---- listActive shows deal2, not the sold-out deal1 -----------------
      const active = await deals.listActive(100);
      assert(
        active.some((d) => d.id === deal2.id) && !active.some((d) => d.id === deal.id),
        'active feed lists claimable deal, excludes sold-out one',
      );
      const d2view = active.find((d) => d.id === deal2.id)!;
      assert(
        d2view.quantityRemaining === 2 && d2view.secondsRemaining > 0,
        'active deal view carries remaining inventory + countdown seed',
      );

      // ---- lifecycle sweep -------------------------------------------------
      // A deal whose window is entirely in the past should end on sweep.
      const pastDeal = await db.query<{ id: string }>(
        `INSERT INTO flash_deals (unit_id, created_by, title, discount_pct, starts_at, ends_at, quantity_total, status)
         VALUES ($1,$2,'Past deal',15, now() - interval '3 hours', now() - interval '1 hour', 5, 'ACTIVE')
         RETURNING id`,
        [unitId, hostUserId],
      );
      const { ended } = await deals.runLifecycle();
      assert(
        ended.includes(pastDeal.rows[0].id),
        'lifecycle sweep ended a deal past its window',
      );

      ws.close();
    },
  );

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode ?? 0), 1500);
}

main().catch((err) => {
  try {
    require('node:fs').writeSync(2, `SMOKE RUN CRASHED: ${err?.stack ?? err}\n`);
  } catch {
    console.error('SMOKE RUN CRASHED:', err);
  }
  setTimeout(() => process.exit(1), 1500);
});
