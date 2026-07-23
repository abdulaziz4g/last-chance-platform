import {
  DomainError,
  InvalidTransitionError,
  InvariantViolationError,
  UnitUnavailableError,
  ValidationFailedError,
} from './domain-errors';

interface PgError {
  code?: string;
  message?: string;
}

const isPgError = (e: unknown): e is PgError =>
  typeof e === 'object' && e !== null && 'code' in e;

/**
 * Translates database-enforced invariants (Phase 1 custom SQLSTATEs — see
 * db/README.md) into domain errors. The exclusion constraint (23P01) and the
 * calendar cross-guard (LC409) are the *authoritative* double-booking
 * defense: application pre-checks exist only for good error messages, and
 * losing the constraint race must surface as the same clean 409.
 */
export function mapPgError(e: unknown): DomainError | unknown {
  if (!isPgError(e)) return e;

  switch (e.code) {
    case '23P01': // exclusion_violation — the overlap guard fired
    case 'LC409': // booking <-> host-block calendar conflict
      return new UnitUnavailableError({ sqlstate: e.code });

    case 'LC400': {
      // FSM trigger rejected the transition; parse "X -> Y" out of the message.
      const m = /transition: (\w+) -> (\w+)/.exec(e.message ?? '');
      return new InvalidTransitionError(m?.[1] ?? 'UNKNOWN', m?.[2] ?? 'UNKNOWN');
    }

    case 'LC401': // immutable booking fields
    case 'LC402': // invalid initial status
      return new ValidationFailedError(e.message ?? 'Invalid booking mutation', {
        sqlstate: e.code,
      });

    case 'LC403': // append-only table mutation — always a bug in our code
    case 'LC422': // unbalanced ledger group — always a bug in our code
      return new InvariantViolationError(
        e.message ?? 'Database invariant violation',
        { sqlstate: e.code },
      );

    default:
      return e;
  }
}
