/**
 * Phase 2 integration smoke test — runs the REAL application wiring
 * (Nest DI, FSM loaded from DB, Redis locks, BullMQ queue) against the live
 * PostgreSQL + Redis from docker-compose, and proves the booking lifecycle
 * end to end, including a 5-way concurrency burst on one unit.
 *
 * Usage:  npm run smoke     (expects docker compose stack on 5432/6379)
 * Fixtures are inserted with unique ids and left in the dev database.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/infrastructure/database/database.service';
import { approveListing } from './support/approve-listing';
import { RequestContextService } from '../src/common/context/request-context.service';
import { BookingService } from '../src/modules/booking/application/booking.service';
import {
  InvalidTransitionError,
  UnitUnavailableError,
} from '../src/common/errors/domain-errors';

let passed = 0;
let failed = 0;

function pass(name: string): void {
  passed++;
  console.log(`  PASS  ${name}`);
}

function fail(name: string, detail?: unknown): void {
  failed++;
  console.error(`  FAIL  ${name}`, detail ?? '');
}

function assert(cond: boolean, name: string, detail?: unknown): void {
  cond ? pass(name) : fail(name, detail);
}

async function expectError(
  name: string,
  fn: () => Promise<unknown>,
  errClass: abstract new (...args: never[]) => Error,
): Promise<void> {
  try {
    await fn();
    fail(name, 'expected error, got success');
  } catch (e) {
    e instanceof errClass
      ? pass(name)
      : fail(name, `wrong error: ${(e as Error)?.constructor?.name}: ${(e as Error)?.message}`);
  }
}

/** Tomorrow at the given UTC hour/minute. */
function tomorrow(h: number, m = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false, // surface bootstrap failures to our catch handler
  });
  const db = app.get(DatabaseService);
  const ctx = app.get(RequestContextService);
  const bookings = app.get(BookingService);

  await ctx.run(
    { requestId: `smoke-${randomUUID()}`, actorType: 'SYSTEM' },
    async () => {
      // ---- fixtures ------------------------------------------------------
      const guestId = randomUUID();
      const hostUserId = randomUUID();
      const propertyId = randomUUID();
      const unitId = randomUUID();
      const tag = Date.now();

      await db.query(
        `INSERT INTO users (id, email, full_name, auth_provider) VALUES
         ($1, $3, 'Smoke Guest', 'google'),
         ($2, $4, 'Smoke Host', 'google')`,
        [guestId, hostUserId, `smoke-guest-${tag}@test.local`, `smoke-host-${tag}@test.local`],
      );
      await db.query(
        `INSERT INTO host_profiles (user_id, display_name) VALUES ($1, 'Smoke Host')`,
        [hostUserId],
      );
      await db.query(
        `INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location)
         VALUES ($1, $2, 'Smoke Property', $3, 'APARTMENT', 'ACTIVE', 'Riyadh', 'SA',
                 ST_SetSRID(ST_MakePoint(46.675, 24.713), 4326)::geography)`,
        [propertyId, hostUserId, `smoke-property-${tag}`],
      );
      await db.query(
        `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                            max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                            turnaround_minutes, status)
         VALUES ($1, $2, 'Smoke Studio', 'STUDIO', true, true, 2, 'SAR', 30000, 8000, 30, 'ACTIVE')`,
        [unitId, propertyId],
      );
      // Listings must clear the regulatory gate (0016) to be bookable.
      await approveListing(db, propertyId);
      console.log('Fixtures created.\n');

      // ---- 1: place a hold ----------------------------------------------
      const holdA = await bookings.createHold({
        guestId,
        unitId,
        bookingType: 'HOURLY',
        checkInUtc: tomorrow(10),
        checkOutUtc: tomorrow(14),
        guestsCount: 2,
      });
      assert(holdA.status === 'PENDING_PAYMENT', 'hold created as PENDING_PAYMENT');
      assert(holdA.totalAmountMinor === 37_904, 'quote math matches (37904 minor)', holdA.totalAmountMinor);
      assert(
        holdA.holdExpiresAt !== null &&
          holdA.holdExpiresAt.getTime() - Date.now() > 9 * 60_000,
        '10-minute hold deadline set',
      );

      // ---- 2: conflicts --------------------------------------------------
      await expectError(
        'overlapping window rejected',
        () =>
          bookings.createHold({
            guestId,
            unitId,
            bookingType: 'HOURLY',
            checkInUtc: tomorrow(13),
            checkOutUtc: tomorrow(15),
            guestsCount: 1,
          }),
        UnitUnavailableError,
      );
      await expectError(
        'turnaround buffer enforced (14:00 start vs 14:30 buffer end)',
        () =>
          bookings.createHold({
            guestId,
            unitId,
            bookingType: 'HOURLY',
            checkInUtc: tomorrow(14),
            checkOutUtc: tomorrow(16),
            guestsCount: 1,
          }),
        UnitUnavailableError,
      );
      const boundary = await bookings.createHold({
        guestId,
        unitId,
        bookingType: 'HOURLY',
        checkInUtc: tomorrow(14, 30),
        checkOutUtc: tomorrow(16, 30),
        guestsCount: 1,
      });
      assert(
        boundary.status === 'PENDING_PAYMENT',
        'exact buffer boundary (14:30) accepted',
      );

      // ---- 3: lifecycle --------------------------------------------------
      const confirmed = await bookings.confirm(holdA.id, 'pay_smoke_ref_1');
      assert(confirmed.status === 'CONFIRMED', 'hold confirmed');
      await expectError(
        'double-confirm rejected by FSM',
        () => bookings.confirm(holdA.id, 'pay_smoke_ref_2'),
        InvalidTransitionError,
      );
      const checkedIn = await bookings.checkIn(holdA.id);
      assert(checkedIn.status === 'CHECKED_IN', 'guest checked in');
      const completed = await bookings.complete(holdA.id);
      assert(completed.status === 'COMPLETED', 'stay completed');

      // ---- 4: expiry -----------------------------------------------------
      const holdB = await bookings.createHold({
        guestId,
        unitId,
        bookingType: 'HOURLY',
        checkInUtc: tomorrow(18),
        checkOutUtc: tomorrow(20),
        guestsCount: 1,
      });
      // Simulate the deadline passing (hold_expires_at is not FSM-locked).
      await db.query(
        `UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE id = $1`,
        [holdB.id],
      );
      const didExpire = await bookings.expireHold(holdB.id);
      assert(didExpire, 'lapsed hold expired (idempotent path)');
      const again = await bookings.expireHold(holdB.id);
      assert(!again, 'second expiry call is a no-op');
      const rebook = await bookings.createHold({
        guestId,
        unitId,
        bookingType: 'HOURLY',
        checkInUtc: tomorrow(18),
        checkOutUtc: tomorrow(20),
        guestsCount: 1,
      });
      assert(
        rebook.status === 'PENDING_PAYMENT',
        'expired window is immediately re-bookable',
      );

      // ---- 5: concurrency burst -----------------------------------------
      // Five simultaneous holds for one fresh window on one unit: the lock +
      // pre-check + exclusion constraint must let EXACTLY one through.
      const day2 = (h: number): Date => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 2);
        d.setUTCHours(h, 0, 0, 0);
        return d;
      };
      const burst = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          bookings.createHold({
            guestId,
            unitId,
            bookingType: 'HOURLY',
            checkInUtc: day2(9),
            checkOutUtc: day2(11),
            guestsCount: 1,
          }),
        ),
      );
      const wins = burst.filter((r) => r.status === 'fulfilled').length;
      const conflicts = burst.filter(
        (r) =>
          r.status === 'rejected' && r.reason instanceof UnitUnavailableError,
      ).length;
      assert(
        wins === 1 && conflicts === 4,
        `concurrency burst: exactly 1 of 5 won (got ${wins} wins, ${conflicts} conflicts)`,
      );

      // ---- 6: DB history attribution ------------------------------------
      const hist = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM booking_status_history WHERE booking_id = $1`,
        [holdA.id],
      );
      assert(
        (hist.rows[0]?.n ?? 0) >= 4,
        `status history recorded (${hist.rows[0]?.n} transitions for lifecycle booking)`,
      );
    },
  );

  await app.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  // BullMQ/ioredis keep-alives can pin the loop; exit explicitly — but only
  // after a beat so Windows pipe buffers flush (process.exit truncates them).
  setTimeout(() => process.exit(process.exitCode ?? 0), 1500);
}

main().catch((err) => {
  // writeSync: survives the hard exit even when stdout/stderr are pipes.
  try {
    require('node:fs').writeSync(2, `SMOKE RUN CRASHED: ${err?.stack ?? err}\n`);
  } catch {
    console.error('SMOKE RUN CRASHED:', err);
  }
  setTimeout(() => process.exit(1), 1500);
});
