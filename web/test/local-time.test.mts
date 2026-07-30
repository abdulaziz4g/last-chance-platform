/**
 * Regression cover for the timezone convention.
 *
 * A booking form value that resolved against the *server's* zone shipped
 * undetected because the backend smoke suites post explicit `...Z` instants and
 * never exercise the web layer at all. These tests pin the two properties that
 * made the bug possible: that a zoneless value means something different
 * depending on who parses it, and that the wire format refuses to carry one.
 *
 * Runs on Node's built-in runner with native type stripping — no test
 * dependency in this package.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isInstant,
  isoToLocalInput,
  localInputAtHour,
  localInputToIso,
  parseLocalInput,
} from '../src/lib/local-time.ts';

/** The helpers are browser-only by design; stand in for one. */
function inBrowser<T>(fn: () => T): T {
  (globalThis as Record<string, unknown>).window = {};
  try {
    return fn();
  } finally {
    delete (globalThis as Record<string, unknown>).window;
  }
}

function withTz<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = tz === prev ? tz : prev;
  }
}

test('the wire format rejects a zoneless form value', () => {
  // This is the exact shape a `datetime-local` input produces, and the exact
  // thing that used to reach a server action and be reinterpreted there.
  assert.equal(isInstant('2026-08-12T09:00'), false);
  assert.equal(isInstant('2026-08-12T09:00:00'), false);
  assert.equal(isInstant(''), false);
});

test('the wire format accepts an instant with an explicit offset', () => {
  assert.equal(isInstant('2026-08-12T06:00:00.000Z'), true);
  assert.equal(isInstant('2026-08-12T09:00:00+03:00'), true);
  assert.equal(isInstant('2026-08-12T06:00Z'), true);
});

test('the wire format rejects impossible dates that still look right', () => {
  assert.equal(isInstant('2026-13-45T99:00:00Z'), false);
});

test('a form value means different instants in different zones', () => {
  const value = '2026-08-12T09:00';
  const riyadh = withTz('Asia/Riyadh', () => inBrowser(() => localInputToIso(value)));
  const utc = withTz('UTC', () => inBrowser(() => localInputToIso(value)));

  assert.equal(riyadh, '2026-08-12T06:00:00.000Z');
  assert.equal(utc, '2026-08-12T09:00:00.000Z');

  // The whole reason conversion belongs in the browser: whoever parses this
  // decides what it means, so it has to be the guest.
  assert.notEqual(riyadh, utc);
});

test('the helpers refuse to run outside a browser', () => {
  const expected = /only correct in the browser/;
  assert.throws(() => localInputToIso('2026-08-12T09:00'), expected);
  assert.throws(() => parseLocalInput('2026-08-12T09:00'), expected);
  assert.throws(() => localInputAtHour(1, 10), expected);
});

test('a form value survives a round trip through an instant', () => {
  withTz('Asia/Riyadh', () =>
    inBrowser(() => {
      const value = '2026-08-12T09:00';
      assert.equal(isoToLocalInput(parseLocalInput(value)), value);
    }),
  );
});

test('unparseable input is reported, not silently turned into an instant', () => {
  inBrowser(() => {
    assert.ok(Number.isNaN(parseLocalInput('')));
    assert.equal(localInputToIso('not a date'), null);
  });
});
