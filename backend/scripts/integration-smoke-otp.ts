/**
 * Phase 7 integration smoke — phone sign-in via Redis-backed OTP.
 *
 * The properties worth proving are the security ones, because a plausible-
 * looking OTP implementation with any of them missing is an auth bypass:
 *   - the code is random, not a fixed development constant
 *   - Redis stores a hash, never the code
 *   - wrong guesses are capped and burn the challenge
 *   - resend cooldown and hourly caps hold
 *   - a used code cannot be replayed
 *   - the response never leaks the code, nor whether the account exists
 *
 * Usage:  node node_modules/ts-node/dist/bin.js scripts/integration-smoke-otp.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/infrastructure/database/database.service';
import { OtpService } from '../src/modules/auth/otp.service';
import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.tokens';

const PORT = 3600;
const BASE = `http://localhost:${PORT}`;

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

async function http<T>(
  path: string,
  body: unknown,
): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
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
  const otp = app.get(OtpService);
  const redis = app.get<Redis>(REDIS_CLIENT);

  // Unique numbers per run so reruns do not trip each other's rate limits.
  const tag = String(Date.now()).slice(-7);
  const phoneLocal = `05${tag.slice(0, 2)}${tag.slice(2)}`; // 05XXXXXXXX
  const phoneE164 = `+9665${tag.slice(0, 2)}${tag.slice(2)}`;
  const clean = async (p: string): Promise<void> => {
    await redis.del(`otp:code:${p}`, `otp:cooldown:${p}`, `otp:sends:${p}`);
  };
  await clean(phoneE164);
  await db.query(`DELETE FROM users WHERE phone = $1`, [phoneE164]);

  // ---- normalisation -------------------------------------------------------
  assert(
    otp.normalisePhone(phoneLocal) === phoneE164 &&
      otp.normalisePhone(phoneE164) === phoneE164 &&
      otp.normalisePhone(`966${phoneE164.slice(4)}`) === phoneE164,
    'Saudi local, bare and +966 forms all normalise to one E.164 number',
    { local: otp.normalisePhone(phoneLocal), e164: phoneE164 },
  );

  let rejected = false;
  try {
    otp.normalisePhone('not-a-number');
  } catch {
    rejected = true;
  }
  assert(rejected, 'a non-number is rejected rather than normalised into one');

  // ---- request -------------------------------------------------------------
  const req = await http<{ expiresInSec: number; resendAfterSec: number }>(
    '/auth/phone/request-otp',
    { phone: phoneLocal },
  );
  assert(
    req.status === 200 && req.json.expiresInSec === 120,
    'request returns a 2-minute challenge',
    req.json,
  );
  // The single most important assertion in this file.
  assert(
    !JSON.stringify(req.json).match(/\d{6}/),
    'the response body does not contain the code',
    req.json,
  );

  const stored = await redis.get(`otp:code:${phoneE164}`);
  assert(stored !== null, 'a challenge is stored in Redis');
  const record = JSON.parse(stored ?? '{}') as { hash?: string; attempts?: number };
  assert(
    typeof record.hash === 'string' &&
      record.hash.length === 64 &&
      record.attempts === 0,
    'Redis holds a sha256 HMAC and an attempt counter, not the code',
    record,
  );

  const ttl = await redis.ttl(`otp:code:${phoneE164}`);
  assert(ttl > 100 && ttl <= 120, `the challenge expires in ${ttl}s`);

  // ---- the code is random --------------------------------------------------
  // Issue several codes for distinct numbers; a fixed constant (the classic
  // "123456" placeholder) would collapse them to one hash.
  // A deliberately disjoint range (+971, not +966). Deriving these from the
  // same tag as the number under test once produced a collision whenever one
  // digit happened to match, and the probe's cleanup then wiped the cooldown
  // key the next assertion depends on — a flake that only appeared on certain
  // timestamps.
  const hashes = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const p = `+9715${String(i)}${tag.slice(0, 6)}`;
    await clean(p);
    await otp.issue(p);
    const raw = await redis.get(`otp:code:${p}`);
    hashes.add((JSON.parse(raw ?? '{}') as { hash: string }).hash);
    await clean(p);
  }
  assert(
    hashes.size === 5,
    `five issued codes produced ${hashes.size} distinct hashes — the code is not a constant`,
  );

  // ---- resend cooldown -----------------------------------------------------
  const tooSoon = await http<{ error?: { code?: string } }>(
    '/auth/phone/request-otp',
    { phone: phoneLocal },
  );
  assert(
    tooSoon.status === 429,
    'an immediate resend is refused by the cooldown',
    tooSoon.status,
  );

  // ---- wrong codes ---------------------------------------------------------
  const wrong = await http<{ error?: { code?: string } }>(
    '/auth/phone/verify-otp',
    { phone: phoneLocal, code: '000000' },
  );
  assert(
    wrong.status === 401,
    'a wrong code is refused without revealing anything',
    wrong.status,
  );

  const afterOneWrong = JSON.parse(
    (await redis.get(`otp:code:${phoneE164}`)) ?? '{}',
  ) as { attempts: number };
  assert(
    afterOneWrong.attempts === 1,
    'wrong guesses are counted',
    afterOneWrong,
  );

  const ttlAfterWrong = await redis.ttl(`otp:code:${phoneE164}`);
  assert(
    ttlAfterWrong <= ttl,
    `a wrong guess does not extend the expiry (${ttlAfterWrong}s <= ${ttl}s)`,
  );

  // Burn the remaining attempts. MAX_ATTEMPTS is 5 and one is already spent.
  for (let i = 0; i < 3; i++) {
    await http('/auth/phone/verify-otp', { phone: phoneLocal, code: '000001' });
  }
  const burn = await http('/auth/phone/verify-otp', {
    phone: phoneLocal,
    code: '000002',
  });
  assert(
    burn.status === 400,
    'the challenge is burned after too many wrong attempts',
    burn.status,
  );
  assert(
    (await redis.get(`otp:code:${phoneE164}`)) === null,
    'the burned challenge is gone from Redis',
  );

  // ---- the happy path ------------------------------------------------------
  // Issue directly so the test knows the code without it ever crossing HTTP.
  await clean(phoneE164);
  const issued = await otp.issue(phoneE164);
  assert(
    /^[0-9]{6}$/.test(issued.code),
    `issued code is six digits (${issued.code.replace(/./g, '•')})`,
  );

  const good = await http<{ accessToken: string; user: { id: string } }>(
    '/auth/phone/verify-otp',
    { phone: phoneLocal, code: issued.code },
  );
  assert(
    good.status === 200 && typeof good.json.accessToken === 'string',
    'a correct code returns a session',
    good.status,
  );

  const user = await db.query<{
    auth_provider: string;
    phone_verified_at: Date | null;
    password_hash: string | null;
  }>(
    `SELECT auth_provider, phone_verified_at, password_hash
       FROM users WHERE phone = $1`,
    [phoneE164],
  );
  assert(
    user.rows[0]?.auth_provider === 'phone' &&
      user.rows[0]?.phone_verified_at !== null &&
      user.rows[0]?.password_hash === null,
    'the account is created as a verified, password-less phone account',
    user.rows[0],
  );

  // ---- replay --------------------------------------------------------------
  const replay = await http('/auth/phone/verify-otp', {
    phone: phoneLocal,
    code: issued.code,
  });
  assert(
    replay.status === 400,
    'a used code cannot be replayed',
    replay.status,
  );

  // ---- signing in again reuses the account --------------------------------
  await clean(phoneE164);
  const second = await otp.issue(phoneE164);
  const again = await http<{ user: { id: string } }>('/auth/phone/verify-otp', {
    phone: phoneLocal,
    code: second.code,
  });
  assert(
    again.status === 200 && again.json.user.id === good.json.user.id,
    'signing in again returns the same account, not a duplicate',
  );

  // ---- hourly cap ----------------------------------------------------------
  const capPhone = `+9665${tag.slice(0, 3)}${tag.slice(3)}9`;
  await clean(capPhone);
  let capped = false;
  for (let i = 0; i < 7; i++) {
    await redis.del(`otp:cooldown:${capPhone}`); // isolate the cap from cooldown
    try {
      await otp.issue(capPhone);
    } catch {
      capped = true;
      break;
    }
  }
  assert(capped, 'the hourly send cap stops an SMS pump');
  await clean(capPhone);

  await db.query(`DELETE FROM users WHERE phone = $1`, [phoneE164]);
  await clean(phoneE164);

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
