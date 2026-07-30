/**
 * Regression smoke — a DISCOUNTED booking must settle end to end.
 *
 * The existing payments smoke (integration-smoke-payments.ts) only ever drives
 * full-price bookings, so it could not see this: PayoutService subtracted
 * discountMinor from the revenue leg even though every figure on the booking
 * row is already derived from the NET base. On any real deal that made the
 * revenue leg negative (money_minor rejects it) or, at minimum, left the credit
 * legs short of the escrow debit by exactly the discount (LC422). Either way
 * the payout transaction rolled back and a flash-deal stay could never pay out.
 *
 * Every discounted booking in the dev database is EXPIRED and every COMPLETED
 * one is full price, which is why this never surfaced in normal use.
 *
 * Drives: flash deal -> discounted hold -> initiate -> signed capture webhook
 * -> CONFIRMED -> check-in -> complete -> payout split + settlement, asserting
 * the ledger balances at every step.
 *
 * Usage:  node node_modules/ts-node/dist/bin.js scripts/integration-smoke-payout-discount.ts
 */
import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/infrastructure/database/database.service';
import { AppConfigService } from '../src/config/config.service';
import { RequestContextService } from '../src/common/context/request-context.service';
import { DealService } from '../src/modules/deals/application/deal.service';
import { PayoutService } from '../src/modules/payment/application/payout.service';

const PORT = 3400;
const BASE = `http://localhost:${PORT}`;
const DISCOUNT_PCT = 30;

let passed = 0;
let failed = 0;
const pass = (name: string): void => {
  passed++;
  console.log(`  PASS  ${name}`);
};
const fail = (name: string, detail?: unknown): void => {
  failed++;
  console.error(`  FAIL  ${name}`, detail ?? '');
};
const assert = (cond: boolean, name: string, detail?: unknown): void =>
  cond ? pass(name) : fail(name, detail);

async function http<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

async function waitFor<T>(
  what: string,
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 25_000,
  everyMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

function dayAt(daysAhead: number, hour: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['error', 'warn'], abortOnError: false, rawBody: true },
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen({ port: PORT, host: '127.0.0.1' });

  const db = app.get(DatabaseService);
  const config = app.get(AppConfigService);
  const ctx = app.get(RequestContextService);
  const deals = app.get(DealService);
  const payouts = app.get(PayoutService);

  const sendWebhook = async (payload: object): Promise<number> => {
    const raw = JSON.stringify(payload);
    const sig = createHmac('sha256', config.mockWebhookSecret)
      .update(raw)
      .digest('hex');
    const res = await fetch(`${BASE}/webhooks/payments/MOCK`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mock-signature': sig },
      body: raw,
    });
    return res.status;
  };

  const balances = async (): Promise<Record<string, number>> => {
    const res = await db.query<{ account: string; balance: number }>(
      `SELECT account::text,
              COALESCE(sum(CASE direction WHEN 'CREDIT' THEN amount_minor
                                          ELSE -amount_minor END), 0)::bigint AS balance
       FROM ledger_entries GROUP BY account`,
    );
    return Object.fromEntries(res.rows.map((r) => [r.account, r.balance]));
  };
  const delta = (
    after: Record<string, number>,
    before: Record<string, number>,
    account: string,
  ): number => (after[account] ?? 0) - (before[account] ?? 0);

  await ctx.run(
    { requestId: `payout-discount-${randomUUID()}`, actorType: 'SYSTEM' },
    async () => {
      const tag = Date.now();
      const hostUserId = randomUUID();
      const guestId = randomUUID();
      const propertyId = randomUUID();
      const unitId = randomUUID();

      await db.query(
        `INSERT INTO users (id, email, full_name, auth_provider) VALUES
         ($1,$3,'Discount Host','google'), ($2,$4,'Discount Guest','google')`,
        [hostUserId, guestId, `dch-${tag}@t.local`, `dcg-${tag}@t.local`],
      );
      await db.query(
        `INSERT INTO host_profiles (user_id, display_name) VALUES ($1,'Discount Host')`,
        [hostUserId],
      );
      await db.query(
        `INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location)
         VALUES ($1,$2,'Discount Property',$3,'APARTHOTEL','ACTIVE','Riyadh','SA',
                 ST_SetSRID(ST_MakePoint(46.67,24.71),4326)::geography)`,
        [propertyId, hostUserId, `dcp-${tag}`],
      );
      await db.query(
        `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                            max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                            turnaround_minutes, status)
         VALUES ($1,$2,'Discount Studio','STUDIO',true,true,4,'SAR',30000::bigint,10000::bigint,30,'ACTIVE')`,
        [unitId, propertyId],
      );
      console.log('Fixtures created.\n');

      const before = await balances();

      // ---- a live deal, claimed as a discounted hold -----------------------
      const deal = await deals.create({
        unitId,
        createdBy: hostUserId,
        title: `${DISCOUNT_PCT}% off — settlement regression`,
        discountPct: DISCOUNT_PCT,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: dayAt(0, 23),
        quantityTotal: 1,
      });
      assert(deal.status === 'ACTIVE', 'flash deal created ACTIVE');

      const booking = await deals.claim({
        dealId: deal.id,
        guestId,
        bookingType: 'HOURLY',
        checkInUtc: dayAt(2, 10),
        checkOutUtc: dayAt(2, 14),
        guestsCount: 2,
      });

      // Guard: without a real discount this whole script proves nothing, so
      // fail loudly rather than passing vacuously if pricing ever changes.
      assert(
        booking.discountMinor > 0,
        `booking carries a real discount (${booking.discountMinor} of ${booking.baseAmountMinor})`,
        booking,
      );
      assert(
        booking.commissionMinor + booking.hostPayoutMinor ===
          booking.baseAmountMinor - booking.discountMinor,
        'booking row satisfies the exact split identity (migration 0015)',
        booking,
      );

      // The precise shape of the old bug: this is what the revenue leg used to
      // be, and money_minor (>= 0) refuses to store it.
      const buggyRevenue =
        booking.commissionMinor + booking.serviceFeeMinor - booking.discountMinor;
      assert(
        buggyRevenue < 0,
        `the old double-subtracted revenue leg would be negative (${buggyRevenue}) — regression is live-fire`,
      );

      const total = booking.totalAmountMinor;
      const hostShare = booking.hostPayoutMinor + booking.cleaningFeeMinor;
      const revenue = booking.commissionMinor + booking.serviceFeeMinor;
      assert(
        hostShare + revenue + booking.taxesMinor === total,
        `split legs sum to the escrow debit (${hostShare} + ${revenue} + ${booking.taxesMinor} = ${total})`,
      );

      // ---- capture ---------------------------------------------------------
      const init = await http<{
        payment: { id: string; status: string; providerPaymentId: string };
      }>('POST', '/payments/initiate', {
        bookingId: booking.id,
        provider: 'MOCK',
        method: 'MADA',
      });
      assert(init.status === 201, 'payment initiated for the discounted booking');

      const captureStatus = await sendWebhook({
        id: `evt_${tag}_disc_capture`,
        type: 'payment.captured',
        data: {
          providerPaymentId: init.json.payment.providerPaymentId,
          amountMinor: total,
          currency: 'SAR',
        },
      });
      assert(captureStatus === 200, 'signed capture webhook accepted');

      await waitFor('booking CONFIRMED', async () => {
        const b = await http<{ status: string }>('GET', `/bookings/${booking.id}`);
        return b.json.status === 'CONFIRMED' ? b.json : null;
      });
      pass('discounted booking CONFIRMED by webhook pipeline');

      const midway = await balances();
      assert(
        delta(midway, before, 'PLATFORM_ESCROW') === total,
        `escrow holds the discounted total (${total})`,
        midway,
      );

      // ---- complete -> payout ---------------------------------------------
      await http('POST', `/bookings/${booking.id}/check-in`);
      const done = await http<{ status: string }>(
        'POST',
        `/bookings/${booking.id}/complete`,
      );
      assert(done.json.status === 'COMPLETED', 'stay completed');

      // THE REGRESSION. Driven in-process rather than through the BullMQ hop:
      // the payments queue is shared Redis, so a dev server running in the same
      // folder consumes 'create-payout' jobs too, and a stale process silently
      // decides the result. (That is exactly what happened while writing this:
      // the job failed in the other process with "debits=33166 credits=21166" —
      // short by precisely the 12000 discount.) The queue hop itself is already
      // covered by integration-smoke-payments.ts; what needs pinning down here
      // is the split arithmetic, so call it directly and leave no ambiguity
      // about whose code ran.
      //
      // Before the fix this call could not succeed for ANY discounted booking:
      // the revenue leg went negative and the whole transaction rolled back, so
      // no payout row could exist.
      const created = await payouts.createForBooking(booking.id);
      assert(created !== null, 'payout created for a discounted booking', created);

      await payouts.executePayout(created!.id);
      const payout = await waitFor('payout PAID', async () => {
        const p = await http<{ status: string; amountMinor: number }>(
          'GET',
          `/payouts/booking/${booking.id}`,
        );
        return p.status === 200 && p.json.status === 'PAID' ? p.json : null;
      });
      assert(
        payout.amountMinor === hostShare,
        `payout equals host share (${hostShare})`,
        payout,
      );

      const after = await balances();
      assert(delta(after, before, 'PLATFORM_ESCROW') === 0, 'escrow fully released');
      assert(delta(after, before, 'HOST_PAYABLE') === 0, 'host payable settled to zero');
      assert(
        delta(after, before, 'PLATFORM_REVENUE') === revenue,
        `platform revenue booked without double-subtracting the discount (${revenue})`,
      );
      assert(
        delta(after, before, 'TAX_PAYABLE') === booking.taxesMinor,
        `VAT liability booked (${booking.taxesMinor})`,
      );

      // Belt and braces: every ledger group touching this booking balances.
      const groups = await db.query<{ unbalanced: string }>(
        `SELECT count(*)::text AS unbalanced FROM (
           SELECT entry_group_id
           FROM ledger_entries WHERE booking_id = $1
           GROUP BY entry_group_id
           HAVING sum(CASE direction WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
         ) x`,
        [booking.id],
      );
      assert(
        groups.rows[0]?.unbalanced === '0',
        'every ledger group for this booking balances',
        groups.rows[0],
      );
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
