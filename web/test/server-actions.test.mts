/**
 * Boundary cover for the three server actions that take times from a form.
 *
 * `web/test/local-time.test.mts` pins the helpers; this pins the call sites,
 * which is where the bug actually lived. The load-bearing assertion in each
 * case is that the instant handed to the API is the *same string* that arrived
 * in the FormData. The original defect was a `new Date(...).toISOString()` in
 * the middle of that path, which silently reinterpreted a zoneless value
 * against the server's zone.
 *
 * These import the real action modules — see ./loader.mts for how a
 * `'use server'` file is made importable without a bundler.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { holdAction } from '../src/app/book/[unitId]/actions.ts';
import { claimDealAction } from '../src/app/deals/[dealId]/claim/actions.ts';
import { createDealAction } from '../src/app/host/deals/actions.ts';

import * as api from './stubs/api.mts';
import * as cache from './stubs/next-cache.mts';
import { setSession } from './stubs/session.mts';
import { RedirectSignal } from './stubs/next-navigation.mts';

const IN = '2026-08-12T06:00:00.000Z';
const OUT = '2026-08-12T10:00:00.000Z';

/** The shape a `datetime-local` input produces — never valid on the wire. */
const ZONELESS_IN = '2026-08-12T09:00';
const ZONELESS_OUT = '2026-08-12T13:00';

/**
 * Valid instants whose canonical form differs from how they are written. A
 * plain `.000Z` value survives a `new Date(...).toISOString()` round trip
 * untouched, so it cannot detect a reparse; these can.
 */
const IN_OFFSET = '2026-08-12T09:00:00+03:00';
const OUT_OFFSET = '2026-08-12T13:00:00+03:00';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const holdForm = (checkInUtc: string, checkOutUtc: string) =>
  form({
    unitId: 'unit-1',
    bookingType: 'HOURLY',
    checkInUtc,
    checkOutUtc,
    guestsCount: '2',
  });

const claimForm = (checkInUtc: string, checkOutUtc: string) =>
  form({
    dealId: 'deal-1',
    bookingType: 'HOURLY',
    checkInUtc,
    checkOutUtc,
    guestsCount: '2',
  });

const dealForm = (startsAt: string, endsAt: string) =>
  form({
    unitId: 'unit-1',
    title: 'Half price tonight',
    discountPct: '50',
    startsAt,
    endsAt,
    quantityTotal: '5',
  });

/** Runs an action that is expected to redirect, returning the target. */
async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error('expected a redirect, but the action returned normally');
}

function withTz<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

beforeEach(() => {
  api.reset();
  cache.reset();
  setSession({ sub: 'guest-1' });
});

// --- the instant must survive the crossing unchanged -----------------------

test('holdAction sends the instant it was given, byte for byte', async () => {
  await captureRedirect(() => holdAction(null, holdForm(IN, OUT)));

  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].path, '/bookings/hold');
  assert.equal(api.calls[0].body.checkInUtc, IN);
  assert.equal(api.calls[0].body.checkOutUtc, OUT);
});

test('holdAction is unaffected by the server timezone', async () => {
  const bodies: unknown[] = [];

  for (const tz of ['UTC', 'Asia/Riyadh', 'America/New_York']) {
    api.reset();
    await withTz(tz, () =>
      captureRedirect(() => holdAction(null, holdForm(IN, OUT))),
    );
    bodies.push(api.calls[0].body);
  }

  // The whole point. Before the fix these three differed by the offset, which
  // is why the same booking form produced a different stay in dev and in a
  // UTC container.
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
  assert.equal((bodies[0] as Record<string, unknown>).checkInUtc, IN);
});

test('holdAction does not canonicalise the instant on its way through', async () => {
  await captureRedirect(() => holdAction(null, holdForm(IN_OFFSET, OUT_OFFSET)));

  // Any reparse rewrites this to 2026-08-12T06:00:00.000Z. Same moment, but a
  // different string — and the action has no business rewriting it at all.
  assert.equal(api.calls[0].body.checkInUtc, IN_OFFSET);
  assert.equal(api.calls[0].body.checkOutUtc, OUT_OFFSET);
});

test('claimDealAction does not canonicalise the instant on its way through', async () => {
  await captureRedirect(() => claimDealAction(null, claimForm(IN_OFFSET, OUT_OFFSET)));

  assert.equal(api.calls[0].body.checkInUtc, IN_OFFSET);
  assert.equal(api.calls[0].body.checkOutUtc, OUT_OFFSET);
});

test('createDealAction does not canonicalise the instants on their way through', async () => {
  await createDealAction(null, dealForm(IN_OFFSET, OUT_OFFSET));

  assert.equal(api.calls[0].body.startsAt, IN_OFFSET);
  assert.equal(api.calls[0].body.endsAt, OUT_OFFSET);
});

test('claimDealAction sends the instant it was given, byte for byte', async () => {
  await captureRedirect(() => claimDealAction(null, claimForm(IN, OUT)));

  assert.equal(api.calls[0].path, '/deals/deal-1/claim');
  assert.equal(api.calls[0].body.checkInUtc, IN);
  assert.equal(api.calls[0].body.checkOutUtc, OUT);
});

test('createDealAction sends the instants it was given, byte for byte', async () => {
  const state = await createDealAction(null, dealForm(IN, OUT));

  assert.equal(state.error, undefined);
  assert.equal(api.calls[0].path, '/deals');
  assert.equal(api.calls[0].body.startsAt, IN);
  assert.equal(api.calls[0].body.endsAt, OUT);
});

// --- a zoneless value must be refused, not reinterpreted -------------------

test('holdAction refuses a zoneless form value without calling the API', async () => {
  const state = await holdAction(null, holdForm(ZONELESS_IN, ZONELESS_OUT));

  assert.match(state.error ?? '', /check-in and check-out/);
  assert.equal(api.calls.length, 0, 'nothing should reach the API');
});

test('claimDealAction refuses a zoneless form value without calling the API', async () => {
  const state = await claimDealAction(null, claimForm(ZONELESS_IN, ZONELESS_OUT));

  assert.match(state.error ?? '', /check-in and check-out/);
  assert.equal(api.calls.length, 0);
});

test('createDealAction refuses a zoneless form value without calling the API', async () => {
  const state = await createDealAction(null, dealForm(ZONELESS_IN, ZONELESS_OUT));

  assert.match(state.error ?? '', /start and end time/);
  assert.equal(api.calls.length, 0);
});

test('a half-supplied window is refused too', async () => {
  const state = await holdAction(null, holdForm(IN, ZONELESS_OUT));

  assert.match(state.error ?? '', /check-in and check-out/);
  assert.equal(api.calls.length, 0);
});

test('an empty window is refused rather than sent as an invalid date', async () => {
  const state = await holdAction(null, holdForm('', ''));

  assert.match(state.error ?? '', /check-in and check-out/);
  assert.equal(api.calls.length, 0);
});

// --- surrounding behaviour the actions are also responsible for ------------

test('holdAction requires a session and does not reach the API without one', async () => {
  setSession(null);
  const state = await holdAction(null, holdForm(IN, OUT));

  assert.match(state.error ?? '', /sign in/i);
  assert.equal(api.calls.length, 0);
});

test('holdAction attaches the session as the guest rather than trusting the form', async () => {
  setSession({ sub: 'guest-42' });
  await captureRedirect(() => holdAction(null, holdForm(IN, OUT)));

  assert.equal(api.calls[0].body.guestId, 'guest-42');
});

test('holdAction redirects to payment for the new booking', async () => {
  const url = await captureRedirect(() => holdAction(null, holdForm(IN, OUT)));

  assert.equal(url, '/book/unit-1/pay?bookingId=booking-1');
});

test('holdAction passes the retry window through on a rate limit', async () => {
  api.setNextResult({
    ok: false,
    error: 'Too many requests.',
    retryAfterSec: 42,
    throttleId: 'hold:unit-1',
  });

  const state = await holdAction(null, holdForm(IN, OUT));

  assert.equal(state.retryAfterSec, 42);
  assert.equal(state.throttleId, 'hold:unit-1');
});

test('claimDealAction redirects using the unit from the response, not the form', async () => {
  api.setNextResult({ ok: true, data: { id: 'booking-9', unitId: 'unit-from-deal' } });

  const url = await captureRedirect(() =>
    claimDealAction(null, claimForm(IN, OUT)),
  );

  assert.equal(url, '/book/unit-from-deal/pay?bookingId=booking-9');
});

test('createDealAction validates the discount before spending a request', async () => {
  const state = await createDealAction(null, dealForm(IN, OUT));
  assert.equal(state.error, undefined);

  api.reset();
  const tooHigh = form({
    unitId: 'unit-1',
    title: 'Absurd',
    discountPct: '95',
    startsAt: IN,
    endsAt: OUT,
    quantityTotal: '5',
  });

  const state2 = await createDealAction(null, tooHigh);
  assert.match(state2.error ?? '', /between 5% and 90%/);
  assert.equal(api.calls.length, 0);
});

test('createDealAction revalidates the deals page on success', async () => {
  await createDealAction(null, dealForm(IN, OUT));

  assert.deepEqual(cache.revalidated, ['/host/deals']);
});
