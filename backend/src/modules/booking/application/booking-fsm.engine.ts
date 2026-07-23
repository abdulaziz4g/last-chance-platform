import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { InvalidTransitionError } from '../../../common/errors/domain-errors';
import { BookingStatus } from '../domain/types';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'BookingFsmEngine' });

/**
 * The Booking finite-state machine.
 *
 * The transition whitelist is NOT hardcoded here: it is loaded at boot from
 * `booking_fsm_transitions` — the same table the database trigger enforces.
 * One source of truth, two enforcement layers:
 *   1. This engine rejects illegal transitions in-process (fast, friendly
 *      errors, no DB round-trip wasted).
 *   2. The DB trigger (SQLSTATE LC400) is the authority — even a buggy
 *      service or a manual psql session cannot corrupt a booking lifecycle.
 */
@Injectable()
export class BookingFsmEngine implements OnApplicationBootstrap {
  private transitions = new Map<BookingStatus, Set<BookingStatus>>();

  constructor(private readonly db: DatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    const res = await this.db.query<{
      from_status: BookingStatus;
      to_status: BookingStatus;
    }>('SELECT from_status, to_status FROM booking_fsm_transitions');

    this.transitions = new Map();
    for (const row of res.rows) {
      if (!this.transitions.has(row.from_status)) {
        this.transitions.set(row.from_status, new Set());
      }
      this.transitions.get(row.from_status)!.add(row.to_status);
    }
    log.info(
      { transitionCount: res.rowCount },
      'Booking FSM loaded from database',
    );
  }

  canTransition(from: BookingStatus, to: BookingStatus): boolean {
    return this.transitions.get(from)?.has(to) ?? false;
  }

  /** Throws InvalidTransitionError unless `from -> to` is whitelisted. */
  assertTransition(from: BookingStatus, to: BookingStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidTransitionError(from, to);
    }
  }

  allowedFrom(from: BookingStatus): readonly BookingStatus[] {
    return [...(this.transitions.get(from) ?? [])];
  }

  /** A status with no outgoing transitions is terminal. */
  isTerminal(status: BookingStatus): boolean {
    return (this.transitions.get(status)?.size ?? 0) === 0;
  }
}
