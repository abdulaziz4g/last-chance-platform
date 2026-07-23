/**
 * Typed domain errors — the ubiquitous error language of the platform.
 * Services throw these; the global filter maps them to HTTP; the SQLSTATE
 * mapper translates database-enforced invariants into them. HTTP codes live
 * here (not in controllers) so every transport (REST, WS, workers) agrees.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested window is taken (booking overlap or host block). */
export class UnitUnavailableError extends DomainError {
  readonly code = 'UNIT_UNAVAILABLE';
  readonly httpStatus = 409;

  constructor(details?: Record<string, unknown>) {
    super('The unit is not available for the requested time window', details);
  }
}

/** Attempted booking state change the FSM does not allow. */
export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
  readonly httpStatus = 409;

  constructor(from: string, to: string) {
    super(`Illegal booking state transition: ${from} -> ${to}`, { from, to });
  }
}

/** The 10-minute payment hold lapsed before payment completed. */
export class HoldExpiredError extends DomainError {
  readonly code = 'HOLD_EXPIRED';
  readonly httpStatus = 409;

  constructor(bookingId: string) {
    super('The payment hold has expired; please book again', { bookingId });
  }
}

/** Another transaction changed the booking between read and write. */
export class StaleStateError extends DomainError {
  readonly code = 'CONFLICTING_UPDATE';
  readonly httpStatus = 409;

  constructor(bookingId: string, currentStatus?: string) {
    super('The booking changed concurrently; refresh and retry', {
      bookingId,
      currentStatus,
    });
  }
}

export class BookingNotFoundError extends DomainError {
  readonly code = 'BOOKING_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(bookingId: string) {
    super('Booking not found', { bookingId });
  }
}

export class UnitNotBookableError extends DomainError {
  readonly code = 'UNIT_NOT_BOOKABLE';
  readonly httpStatus = 422;

  constructor(reason: string, details?: Record<string, unknown>) {
    super(reason, details);
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;
}

/** Could not acquire the per-unit lock within the retry budget. */
export class LockNotAcquiredError extends DomainError {
  readonly code = 'RESOURCE_CONTENTION';
  readonly httpStatus = 409;

  constructor(key: string) {
    super('The resource is busy; please retry', { key });
  }
}

/** A database-level invariant fired that application code should have made
 *  impossible (append-only violation, unbalanced ledger). Always a bug. */
export class InvariantViolationError extends DomainError {
  readonly code = 'INVARIANT_VIOLATION';
  readonly httpStatus = 500;
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly httpStatus = 401;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;

  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly httpStatus = 401;

  constructor() {
    super('Email or password is incorrect');
  }
}

export class EmailTakenError extends DomainError {
  readonly code = 'EMAIL_TAKEN';
  readonly httpStatus = 409;

  constructor(email: string) {
    super('An account with this email already exists', { email });
  }
}

export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly httpStatus = 429;

  constructor(retryAfterSec: number) {
    super('Too many requests; slow down', { retryAfterSec });
  }
}

/** Flash deal has no remaining inventory (atomic claim returned 0 rows). */
export class FlashDealSoldOutError extends DomainError {
  readonly code = 'FLASH_DEAL_SOLD_OUT';
  readonly httpStatus = 409;

  constructor(dealId: string) {
    super('This flash deal is sold out', { dealId });
  }
}

/** Deal is not claimable right now (not ACTIVE, outside window, wrong unit). */
export class FlashDealNotClaimableError extends DomainError {
  readonly code = 'FLASH_DEAL_NOT_CLAIMABLE';
  readonly httpStatus = 409;

  constructor(reason: string, details?: Record<string, unknown>) {
    super(reason, details);
  }
}

export class FlashDealNotFoundError extends DomainError {
  readonly code = 'FLASH_DEAL_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(dealId: string) {
    super('Flash deal not found', { dealId });
  }
}
