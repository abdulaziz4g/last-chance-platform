/**
 * Phase 6 integration smoke — security & realtime, against the live stack:
 *
 *   register -> login -> JWT-authed booking hold
 *   -> the DB audit trail attributes the REAL user (JWT -> context -> SET LOCAL)
 *   -> WebSocket gateway pushes HOLD_PLACED (Redis Pub/Sub fan-out)
 *   -> invalid token 401; rate limiter 429s a login hammer.
 *
 * Usage: node node_modules/ts-node/dist/bin.js scripts/integration-smoke-phase6.ts
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

const PORT = 3200;
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

function tomorrowUtc(h: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(h, 0, 0, 0);
  return d.toISOString();
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

  // ---- auth cycle -----------------------------------------------------------
  const email = `p6-${Date.now()}@test.local`;
  const password = 'correct-horse-battery';

  const reg = await http<{ accessToken: string; user: { id: string } }>(
    'POST',
    '/auth/register',
    { email, password, fullName: 'Phase Six Guest' },
  );
  assert(reg.status === 201 && reg.json.accessToken.length > 20, 'register issues a JWT');
  const userId = reg.json.user.id;

  const login = await http<{ accessToken: string }>('POST', '/auth/login', {
    email,
    password,
  });
  assert(login.status === 200, 'login succeeds');
  const token = login.json.accessToken;
  const bearer = { authorization: `Bearer ${token}` };

  const me = await http<{ sub: string; actorType: string }>(
    'GET',
    '/auth/me',
    undefined,
    bearer,
  );
  assert(
    me.status === 200 && me.json.sub === userId && me.json.actorType === 'GUEST',
    'token introspection returns the verified identity',
  );

  const badToken = await http<{ error: { code: string } }>(
    'GET',
    '/auth/me',
    undefined,
    { authorization: 'Bearer tampered.token.here' },
  );
  assert(
    badToken.status === 401 && badToken.json.error.code === 'UNAUTHORIZED',
    'invalid token rejected with 401 (never downgraded to anonymous)',
  );

  const wrongPw = await http<{ error: { code: string } }>(
    'POST',
    '/auth/login',
    { email, password: 'wrong-password-123' },
  );
  assert(
    wrongPw.status === 401 && wrongPw.json.error.code === 'INVALID_CREDENTIALS',
    'wrong password rejected',
  );

  // ---- fixtures (host/property/unit; guest is the REGISTERED user) ----------
  const hostUserId = randomUUID();
  const propertyId = randomUUID();
  const unitId = randomUUID();
  const tag = Date.now();
  await db.query(
    `INSERT INTO users (id, email, full_name, auth_provider)
     VALUES ($1, $2, 'P6 Host', 'google')`,
    [hostUserId, `p6-host-${tag}@test.local`],
  );
  await db.query(
    `INSERT INTO host_profiles (user_id, display_name) VALUES ($1, 'P6 Host')`,
    [hostUserId],
  );
  await db.query(
    `INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location)
     VALUES ($1, $2, 'P6 Property', $3, 'APARTMENT', 'ACTIVE', 'Riyadh', 'SA',
             ST_SetSRID(ST_MakePoint(46.675, 24.713), 4326)::geography)`,
    [propertyId, hostUserId, `p6-property-${tag}`],
  );
  await db.query(
    `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                        max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                        turnaround_minutes, status)
     VALUES ($1, $2, 'P6 Studio', 'STUDIO', true, true, 2, 'SAR', 30000, 8000, 30, 'ACTIVE')`,
    [unitId, propertyId],
  );

  // ---- WebSocket gateway ----------------------------------------------------
  const ws = new WebSocket(`ws://localhost:${PORT}/ws/availability`);
  const wsEvents: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) =>
    wsEvents.push(JSON.parse(String(raw)) as Record<string, unknown>),
  );
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  ws.send(JSON.stringify({ action: 'subscribe', all: true }));
  await new Promise((r) => setTimeout(r, 300));
  assert(
    wsEvents.some((e) => e['type'] === 'SUBSCRIBED'),
    'WS gateway acknowledges subscription',
  );

  // ---- JWT-authed hold + audit attribution + WS push ------------------------
  const hold = await http<{ id: string; status: string }>(
    'POST',
    '/bookings/hold',
    {
      guestId: userId,
      unitId,
      bookingType: 'HOURLY',
      checkInUtc: tomorrowUtc(9),
      checkOutUtc: tomorrowUtc(12),
      guestsCount: 2,
    },
    bearer,
  );
  assert(
    hold.status === 201 && hold.json.status === 'PENDING_PAYMENT',
    'JWT-authenticated hold placed',
  );

  const deadline = Date.now() + 5000;
  while (
    Date.now() < deadline &&
    !wsEvents.some((e) => e['type'] === 'HOLD_PLACED')
  ) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const holdEvent = wsEvents.find((e) => e['type'] === 'HOLD_PLACED');
  assert(
    holdEvent !== undefined &&
      holdEvent['unitId'] === unitId &&
      holdEvent['bookingId'] === hold.json.id,
    'WS gateway pushed HOLD_PLACED for the unit (Redis fan-out live)',
  );
  ws.close();

  const attribution = await db.query<{ actor_id: string | null; actor_type: string }>(
    `SELECT actor_id, actor_type::text FROM booking_status_history
     WHERE booking_id = $1 ORDER BY id LIMIT 1`,
    [hold.json.id],
  );
  assert(
    attribution.rows[0]?.actor_id === userId &&
      attribution.rows[0]?.actor_type === 'GUEST',
    'DB audit trail attributes the verified JWT identity (not a header claim)',
  );

  // ---- rate limiting (last: it exhausts the login budget) -------------------
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const r = await http('POST', '/auth/login', {
      email,
      password: 'hammering-wrong-password',
    });
    statuses.push(r.status);
  }
  const throttled = statuses.filter((s) => s === 429).length;
  assert(
    throttled >= 2,
    `login hammer throttled (${throttled}/12 got 429 after the 10/min budget)`,
    statuses,
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
