import { BookingFsmEngine } from '../src/modules/booking/application/booking-fsm.engine';
import { InvalidTransitionError } from '../src/common/errors/domain-errors';
import type { DatabaseService } from '../src/infrastructure/database/database.service';

/**
 * The engine must faithfully mirror whatever the DB transition table says.
 *
 * Keep this list in step with booking_fsm_transitions (migrations 0006 + 0015).
 * It is a stub, so a drifted copy does not fail loudly — it just quietly tests
 * an FSM the database no longer has.
 */
const TRANSITIONS = [
  ['DRAFT', 'PENDING_PAYMENT'],
  ['DRAFT', 'CANCELLED'],
  ['PENDING_PAYMENT', 'CONFIRMED'],
  ['PENDING_PAYMENT', 'EXPIRED'],
  ['PENDING_PAYMENT', 'CANCELLED'],
  ['CONFIRMED', 'CHECKED_IN'],
  ['CONFIRMED', 'CANCELLED'],
  ['CONFIRMED', 'COMPLETED'], // 0015: no-show — stay elapsed without check-in
  ['CHECKED_IN', 'COMPLETED'],
  ['CHECKED_IN', 'CANCELLED'], // 0015: terminated mid-occupancy
  ['CANCELLED', 'REFUNDED'],
  ['COMPLETED', 'REFUNDED'],
] as const;

const dbStub = {
  query: jest.fn().mockResolvedValue({
    rows: TRANSITIONS.map(([from_status, to_status]) => ({
      from_status,
      to_status,
    })),
    rowCount: TRANSITIONS.length,
  }),
} as unknown as DatabaseService;

describe('BookingFsmEngine', () => {
  let engine: BookingFsmEngine;

  beforeEach(async () => {
    engine = new BookingFsmEngine(dbStub);
    await engine.onApplicationBootstrap();
  });

  it('allows every whitelisted transition', () => {
    for (const [from, to] of TRANSITIONS) {
      expect(engine.canTransition(from, to)).toBe(true);
    }
  });

  it('rejects transitions missing from the whitelist', () => {
    expect(engine.canTransition('EXPIRED', 'CONFIRMED')).toBe(false); // terminal
    expect(engine.canTransition('DRAFT', 'CONFIRMED')).toBe(false); // skips payment
    expect(engine.canTransition('PENDING_PAYMENT', 'CHECKED_IN')).toBe(false); // skips payment
    expect(engine.canTransition('COMPLETED', 'CHECKED_IN')).toBe(false); // backwards
    expect(engine.canTransition('CONFIRMED', 'DRAFT')).toBe(false); // backwards
  });

  it('lets a stay complete without a check-in (no-show settles)', () => {
    // Migration 0015. Before it, COMPLETED was reachable only via CHECKED_IN,
    // so a guest who never showed left the escrow with no legal way out:
    // PayoutService gates the split on COMPLETED.
    expect(engine.canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(engine.canTransition('CHECKED_IN', 'CANCELLED')).toBe(true);
  });

  it('assertTransition throws typed domain errors', () => {
    expect(() => engine.assertTransition('PENDING_PAYMENT', 'CONFIRMED')).not.toThrow();
    expect(() => engine.assertTransition('CONFIRMED', 'COMPLETED')).not.toThrow();
    expect(() => engine.assertTransition('PENDING_PAYMENT', 'CHECKED_IN')).toThrow(
      InvalidTransitionError,
    );
  });

  it('identifies terminal states', () => {
    expect(engine.isTerminal('REFUNDED')).toBe(true);
    expect(engine.isTerminal('EXPIRED')).toBe(true);
    expect(engine.isTerminal('PENDING_PAYMENT')).toBe(false);
    // CANCELLED still allows -> REFUNDED, so it is NOT terminal.
    expect(engine.isTerminal('CANCELLED')).toBe(false);
  });
});
