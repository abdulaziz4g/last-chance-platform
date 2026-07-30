/**
 * Cover for the availability warning's decision logic.
 *
 * This is the piece that was verified wrong once: the amber warning was
 * demonstrated firing on a window that did not actually clash, because the form
 * fields were read as UTC while the action read them as server-local. A warning
 * appearing on screen proves nothing on its own — it has to be the *right*
 * warning, which is what these check.
 *
 * The component itself is not rendered here; JSX needs a transform Node does
 * not have, and adding one for this would be a heavy dependency. What is
 * covered is every decision it makes. What is not: the JSX, and the socket
 * wiring in `useRealtime`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  affectsForm,
  overlaps,
  windowFromEvent,
  type TakenWindow,
} from '../src/app/book/[unitId]/availability-decision.ts';
import type { RealtimeEvent } from '../src/lib/realtime.ts';

const UNIT = 'unit-1';

function availabilityEvent(over: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'HOLD_PLACED',
    unitId: UNIT,
    propertyId: 'prop-1',
    bookingId: 'booking-1',
    checkInUtc: '2026-08-12T08:00:00.000Z',
    checkOutUtc: '2026-08-12T09:00:00.000Z',
    occurredAt: '2026-08-11T00:00:00.000Z',
    ...over,
  } as unknown as RealtimeEvent;
}

/** The helpers read the guest's zone, so stand in for a browser in it. */
function asGuestIn<T>(tz: string, fn: () => T): T {
  const previousTz = process.env.TZ;
  process.env.TZ = tz;
  (globalThis as Record<string, unknown>).window = {};
  try {
    return fn();
  } finally {
    delete (globalThis as Record<string, unknown>).window;
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
}

const taken = (fromIso: string, toIso: string): TakenWindow => ({
  from: Date.parse(fromIso),
  to: Date.parse(toIso),
  freed: false,
});

// --- which events are this unit's business --------------------------------

test('an event for another unit is ignored', () => {
  assert.equal(windowFromEvent(availabilityEvent({ unitId: 'other' }), UNIT), null);
});

test('a deal event is ignored', () => {
  const deal = {
    type: 'DEAL_CLAIMED',
    dealId: 'deal-1',
    unitId: UNIT,
    quantityRemaining: 2,
    occurredAt: '2026-08-11T00:00:00.000Z',
  } as unknown as RealtimeEvent;

  assert.equal(windowFromEvent(deal, UNIT), null);
});

test('the subscribe acknowledgement is ignored', () => {
  const ack = {
    type: 'SUBSCRIBED',
    all: false,
    unitIds: [UNIT],
    propertyIds: [],
  } as unknown as RealtimeEvent;

  assert.equal(windowFromEvent(ack, UNIT), null);
});

test('an event with unparseable times is ignored rather than compared as NaN', () => {
  assert.equal(
    windowFromEvent(availabilityEvent({ checkInUtc: 'not a date' }), UNIT),
    null,
  );
  assert.equal(
    windowFromEvent(availabilityEvent({ checkOutUtc: '' }), UNIT),
    null,
  );
});

test('a hold reads as taken and a release reads as freed', () => {
  assert.equal(windowFromEvent(availabilityEvent(), UNIT)?.freed, false);
  assert.equal(
    windowFromEvent(availabilityEvent({ type: 'BOOKING_CONFIRMED' }), UNIT)?.freed,
    false,
  );
  assert.equal(
    windowFromEvent(availabilityEvent({ type: 'INVENTORY_RELEASED' }), UNIT)?.freed,
    true,
  );
});

// --- the overlap rule itself ----------------------------------------------

test('overlap is half-open, so touching end to start is not a clash', () => {
  assert.equal(overlaps(0, 10, 10, 20), false, 'ours ends as theirs begins');
  assert.equal(overlaps(10, 20, 0, 10), false, 'theirs ends as ours begins');
  assert.equal(overlaps(0, 10, 9, 20), true, 'one unit of genuine overlap');
  assert.equal(overlaps(0, 10, 2, 5), true, 'theirs sits inside ours');
  assert.equal(overlaps(2, 5, 0, 10), true, 'ours sits inside theirs');
});

// --- the regression: both sides on the guest's clock ----------------------

test('the form window is read in the guest zone, not as UTC', () => {
  // 09:00-13:00 in Riyadh is 06:00-10:00Z. A rival hold at 08:00-09:00Z sits
  // inside that, so it clashes.
  const clash = asGuestIn('Asia/Riyadh', () =>
    affectsForm(
      taken('2026-08-12T08:00:00.000Z', '2026-08-12T09:00:00.000Z'),
      '2026-08-12T09:00',
      '2026-08-12T13:00',
    ),
  );
  assert.equal(clash, true);
});

test('a rival window that only touches the end does not warn', () => {
  // 10:00-11:00Z begins exactly when the form's 09:00-13:00 Riyadh ends.
  // Reading the form as UTC instead would make this look like a clash — the
  // false positive that was once demonstrated as a passing verification.
  const clash = asGuestIn('Asia/Riyadh', () =>
    affectsForm(
      taken('2026-08-12T10:00:00.000Z', '2026-08-12T11:00:00.000Z'),
      '2026-08-12T09:00',
      '2026-08-12T13:00',
    ),
  );
  assert.equal(clash, false);
});

test('the same form text means different things to guests in different zones', () => {
  const window = taken('2026-08-12T08:00:00.000Z', '2026-08-12T09:00:00.000Z');
  const args = ['2026-08-12T09:00', '2026-08-12T13:00'] as const;

  // In Riyadh 09:00-13:00 is 06:00-10:00Z and clashes; in UTC it is
  // 09:00-13:00Z, which the rival window only touches.
  assert.equal(asGuestIn('Asia/Riyadh', () => affectsForm(window, ...args)), true);
  assert.equal(asGuestIn('UTC', () => affectsForm(window, ...args)), false);
});

test('a window far from the form is not worth mentioning', () => {
  const clash = asGuestIn('Asia/Riyadh', () =>
    affectsForm(
      taken('2026-08-20T08:00:00.000Z', '2026-08-20T09:00:00.000Z'),
      '2026-08-12T09:00',
      '2026-08-12T13:00',
    ),
  );
  assert.equal(clash, false);
});

test('an unfilled form never warns', () => {
  const window = taken('2026-08-12T08:00:00.000Z', '2026-08-12T09:00:00.000Z');

  asGuestIn('Asia/Riyadh', () => {
    assert.equal(affectsForm(window, '', ''), false);
    assert.equal(affectsForm(window, '2026-08-12T09:00', ''), false);
    assert.equal(affectsForm(window, 'nonsense', '2026-08-12T13:00'), false);
  });
});
