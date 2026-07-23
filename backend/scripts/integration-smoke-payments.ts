/**
 * Phase 3 integration smoke — drives the FULL escrow money cycle over real
 * HTTP against the live docker-compose stack:
 *
 *   hold -> initiate payment -> signed capture webhook -> CONFIRMED +
 *   escrow ledger -> check-in -> complete -> payout split + transfer +
 *   settlement ledger ... and the refund cycle on a second booking.
 *
 * Also proves: webhook idempotency (duplicate event id), signature rejection,
 * and the generated OpenAPI document.
 *
 * Usage:  node node_modules/ts-node/dist/bin.js scripts/integration-smoke-payments.ts
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

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

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
  headers: Record<string, string> = {},
): Promise<{ status: number; json: T }> {
  // Only claim a JSON body when one is actually sent — Fastify rejects
  // content-type: application/json with an empty body (FST_ERR_CTP_EMPTY_JSON_BODY).
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers:
      body === undefined
        ? headers
        : { 'content-type': 'application/json', ...headers },
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

function tomorrow(h: number, m = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

interface BookingDto {
  id: string;
  status: string;
  totalAmountMinor: number;
  commissionMinor: number;
  serviceFeeMinor: number;
  taxesMinor: number;
  hostPayoutMinor: number;
  cleaningFeeMinor: number;
  currency: string;
}

async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    // rawBody mirrors main.ts — signatures verify the exact signed bytes.
    { logger: ['error', 'warn'], abortOnError: false, rawBody: true },
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen({ port: PORT, host: '127.0.0.1' });

  const db = app.get(DatabaseService);
  const config = app.get(AppConfigService);

  const sign = (payload: object): { raw: string; sig: string } => {
    const raw = JSON.stringify(payload);
    return {
      raw,
      sig: createHmac('sha256', config.mockWebhookSecret).update(raw).digest('hex'),
    };
  };
  const sendWebhook = async (
    payload: object,
    sigOverride?: string,
  ): Promise<{ status: number; json: { received: boolean; duplicate: boolean } }> => {
    const { raw, sig } = sign(payload);
    const res = await fetch(`${BASE}/webhooks/payments/MOCK`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mock-signature': sigOverride ?? sig,
      },
      body: raw,
    });
    return { status: res.status, json: (await res.json()) as never };
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

  // ---- fixtures -------------------------------------------------------------
  const guestId = randomUUID();
  const hostUserId = randomUUID();
  const propertyId = randomUUID();
  const unitId = randomUUID();
  const tag = Date.now();
  await db.query(
    `INSERT INTO users (id, email, full_name, auth_provider) VALUES
     ($1, $3, 'Pay Guest', 'google'), ($2, $4, 'Pay Host', 'google')`,
    [guestId, hostUserId, `pay-guest-${tag}@test.local`, `pay-host-${tag}@test.local`],
  );
  await db.query(
    `INSERT INTO host_profiles (user_id, display_name) VALUES ($1, 'Pay Host')`,
    [hostUserId],
  );
  await db.query(
    `INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location)
     VALUES ($1, $2, 'Pay Property', $3, 'APARTMENT', 'ACTIVE', 'Riyadh', 'SA',
             ST_SetSRID(ST_MakePoint(46.675, 24.713), 4326)::geography)`,
    [propertyId, hostUserId, `pay-property-${tag}`],
  );
  await db.query(
    `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                        max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                        turnaround_minutes, status)
     VALUES ($1, $2, 'Pay Studio', 'STUDIO', true, true, 2, 'SAR', 30000, 8000, 30, 'ACTIVE')`,
    [unitId, propertyId],
  );
  console.log('Fixtures created.\n');

  const before = await balances();

  // ---- happy path: hold -> pay -> confirm -> complete -> payout -------------
  const hold = await http<BookingDto>('POST', '/bookings/hold', {
    guestId,
    unitId,
    bookingType: 'HOURLY',
    checkInUtc: tomorrow(10),
    checkOutUtc: tomorrow(14),
    guestsCount: 2,
  });
  assert(hold.status === 201 && hold.json.status === 'PENDING_PAYMENT', 'hold placed over HTTP');
  const bookingId = hold.json.id;
  const total = hold.json.totalAmountMinor;
  const hostShare = hold.json.hostPayoutMinor + hold.json.cleaningFeeMinor;
  const revenue = hold.json.commissionMinor + hold.json.serviceFeeMinor;

  const init = await http<{
    payment: { id: string; status: string; providerPaymentId: string };
    clientAction: Record<string, unknown> | null;
  }>('POST', '/payments/initiate', {
    bookingId,
    provider: 'MOCK',
    method: 'MADA',
  });
  assert(
    init.status === 201 && init.json.payment.status === 'REQUIRES_ACTION',
    'payment initiated (REQUIRES_ACTION with provider intent)',
  );
  assert(init.json.clientAction !== null, 'client action returned');
  const providerPaymentId = init.json.payment.providerPaymentId;
  const paymentId = init.json.payment.id;

  const replay = await http<{ payment: { id: string } }>('POST', '/payments/initiate', {
    bookingId,
    provider: 'MOCK',
    method: 'MADA',
  });
  assert(
    replay.json.payment.id === paymentId,
    'initiate is idempotent (same payment row on replay)',
  );

  // Capture webhook (signed), plus duplicate + tampered variants.
  const captureEvent = {
    id: `evt_${tag}_capture`,
    type: 'payment.captured',
    data: { providerPaymentId, amountMinor: total, currency: 'SAR' },
  };
  const wh1 = await sendWebhook(captureEvent);
  assert(wh1.status === 200 && wh1.json.received && !wh1.json.duplicate, 'capture webhook accepted');
  const wh2 = await sendWebhook(captureEvent);
  assert(wh2.status === 200 && wh2.json.duplicate, 'duplicate event id acknowledged, not reprocessed');
  const wh3 = await sendWebhook(captureEvent, 'deadbeef'.repeat(8));
  assert(wh3.status === 400 && !wh3.json.received, 'tampered signature rejected (400)');

  await waitFor('booking CONFIRMED', async () => {
    const b = await http<BookingDto>('GET', `/bookings/${bookingId}`);
    return b.json.status === 'CONFIRMED' ? b.json : null;
  });
  pass('booking CONFIRMED by webhook pipeline');

  const paid = await http<{ status: string }>('GET', `/payments/${paymentId}`);
  assert(paid.json.status === 'CAPTURED', 'payment CAPTURED');

  const midway = await balances();
  assert(
    delta(midway, before, 'PLATFORM_ESCROW') === total,
    `escrow holds the full amount (${total})`,
    midway,
  );

  const ci = await http<BookingDto>('POST', `/bookings/${bookingId}/check-in`);
  const co = await http<BookingDto>('POST', `/bookings/${bookingId}/complete`);
  assert(
    ci.json.status === 'CHECKED_IN' && co.json.status === 'COMPLETED',
    'checked in + completed over HTTP',
    { checkIn: ci.json, complete: co.json },
  );

  const payout = await waitFor('payout PAID', async () => {
    const p = await http<{ status: string; amountMinor: number }>(
      'GET',
      `/payouts/booking/${bookingId}`,
    );
    return p.status === 200 && p.json.status === 'PAID' ? p.json : null;
  });
  assert(payout.amountMinor === hostShare, `payout equals host share (${hostShare})`);

  const after = await balances();
  assert(delta(after, before, 'PLATFORM_ESCROW') === 0, 'escrow fully released after payout');
  assert(delta(after, before, 'HOST_PAYABLE') === 0, 'host payable settled to zero');
  assert(
    delta(after, before, 'PLATFORM_REVENUE') === revenue,
    `platform revenue booked (${revenue})`,
  );
  assert(
    delta(after, before, 'TAX_PAYABLE') === hold.json.taxesMinor,
    `VAT liability booked (${hold.json.taxesMinor})`,
  );

  // ---- refund path: second booking, cancel after capture --------------------
  const hold2 = await http<BookingDto>('POST', '/bookings/hold', {
    guestId,
    unitId,
    bookingType: 'HOURLY',
    checkInUtc: tomorrow(18),
    checkOutUtc: tomorrow(20),
    guestsCount: 1,
  });
  const booking2 = hold2.json.id;
  const total2 = hold2.json.totalAmountMinor;
  const init2 = await http<{ payment: { id: string; providerPaymentId: string } }>(
    'POST',
    '/payments/initiate',
    { bookingId: booking2, provider: 'MOCK', method: 'VISA' },
  );
  const providerPaymentId2 = init2.json.payment.providerPaymentId;
  await sendWebhook({
    id: `evt_${tag}_capture2`,
    type: 'payment.captured',
    data: { providerPaymentId: providerPaymentId2, amountMinor: total2, currency: 'SAR' },
  });
  await waitFor('booking2 CONFIRMED', async () => {
    const b = await http<BookingDto>('GET', `/bookings/${booking2}`);
    return b.json.status === 'CONFIRMED' ? b.json : null;
  });

  const cancel = await http<BookingDto>('POST', `/bookings/${booking2}/cancel`, {
    cancelledBy: 'GUEST',
    reason: 'change of plans',
  });
  assert(cancel.json.status === 'CANCELLED', 'confirmed booking cancelled');

  // The refund worker asks the provider for a refund; grab its reference,
  // then play the provider's settlement webhook.
  const providerRefundId = await waitFor('refund initiated at provider', async () => {
    const r = await db.query<{ provider_refund_id: string | null }>(
      `SELECT r.provider_refund_id FROM refunds r
       JOIN payments p ON p.id = r.payment_id
       WHERE p.booking_id = $1`,
      [booking2],
    );
    return r.rows[0]?.provider_refund_id ?? null;
  });
  await sendWebhook({
    id: `evt_${tag}_refund2`,
    type: 'refund.succeeded',
    data: { providerPaymentId: providerPaymentId2, providerRefundId },
  });

  await waitFor('booking2 REFUNDED', async () => {
    const b = await http<BookingDto>('GET', `/bookings/${booking2}`);
    return b.json.status === 'REFUNDED' ? b.json : null;
  });
  pass('cancel -> provider refund -> webhook -> booking REFUNDED');

  const final = await balances();
  assert(
    delta(final, after, 'PLATFORM_ESCROW') === 0,
    'refunded escrow released (net zero for booking 2)',
  );
  assert(
    delta(final, after, 'GUEST_REFUND_CLEARING') === total2,
    `refund clearing carries the returned amount (${total2})`,
  );

  // ---- OpenAPI --------------------------------------------------------------
  const docs = await http<{ openapi: string; paths: Record<string, unknown> }>(
    'GET',
    '/docs/openapi.json',
  );
  assert(
    docs.status === 200 &&
      docs.json.openapi === '3.1.0' &&
      Object.keys(docs.json.paths).length >= 10,
    `OpenAPI 3.1 document served (${Object.keys(docs.json.paths).length} paths)`,
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
