import { BookingFsmEngine } from '../src/modules/booking/application/booking-fsm.engine';
import { InvalidTransitionError } from '../src/common/errors/domain-errors';
import type { DatabaseService } from '../src/infrastructure/database/database.service';

/** The engine must faithfully mirror whatever the DB transition table says. */
const TRANSITIONS = [
  ['DRAFT', 'PENDING_PAYMENT'],
  ['DRAFT', 'CANCELLED'],
  ['PENDING_PAYMENT', 'CONFIRMED'],
  ['PENDING_PAYMENT', 'EXPIRED'],
  ['PENDING_PAYMENT', 'CANCELLED'],
  ['CONFIRMED', 'CHECKED_IN'],
  ['CONFIRMED', 'CANCELLED'],
  ['CHECKED_IN', 'COMPLETED'],
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
    expect(engine.canTransition('CONFIRMED', 'COMPLETED')).toBe(false); // skips CHECKED_IN
    expect(engine.canTransition('EXPIRED', 'CONFIRMED')).toBe(false); // terminal
    expect(engine.canTransition('DRAFT', 'CONFIRMED')).toBe(false); // skips payment
    expect(engine.canTransition('COMPLETED', 'CHECKED_IN')).toBe(false); // backwards
  });

  it('assertTransition throws typed domain errors', () => {
    expect(() => engine.assertTransition('PENDING_PAYMENT', 'CONFIRMED')).not.toThrow();
    expect(() => engine.assertTransition('CONFIRMED', 'COMPLETED')).toThrow(
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
