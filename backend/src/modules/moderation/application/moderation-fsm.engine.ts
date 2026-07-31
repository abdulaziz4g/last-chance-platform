import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { InvalidModerationTransitionError } from '../../../common/errors/domain-errors';
import { ModerationStatus } from '../domain/types';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'ModerationFsmEngine' });

/**
 * The listing-approval finite-state machine.
 *
 * Deliberately the same shape as BookingFsmEngine: the whitelist is NOT
 * hardcoded here, it is loaded at boot from `property_moderation_transitions`
 * — the same table the LC410 trigger enforces. One source of truth, two
 * enforcement layers:
 *   1. This engine rejects illegal transitions in-process, so the host or
 *      admin gets a clean typed error without a wasted round-trip.
 *   2. The database trigger is the authority. A buggy service, a rogue admin
 *      script, or a manual psql session cannot invent an approval — which
 *      matters more here than for bookings, because an approval is a
 *      regulatory assertion about documents someone actually checked.
 */
@Injectable()
export class ModerationFsmEngine implements OnApplicationBootstrap {
  private transitions = new Map<ModerationStatus, Set<ModerationStatus>>();

  constructor(private readonly db: DatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    const res = await this.db.query<{
      from_status: ModerationStatus;
      to_status: ModerationStatus;
    }>('SELECT from_status, to_status FROM property_moderation_transitions');

    this.transitions = new Map();
    for (const row of res.rows) {
      if (!this.transitions.has(row.from_status)) {
        this.transitions.set(row.from_status, new Set());
      }
      this.transitions.get(row.from_status)!.add(row.to_status);
    }
    log.info(
      { transitionCount: res.rowCount },
      'Moderation FSM loaded from database',
    );
  }

  canTransition(from: ModerationStatus, to: ModerationStatus): boolean {
    return this.transitions.get(from)?.has(to) ?? false;
  }

  assertTransition(from: ModerationStatus, to: ModerationStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidModerationTransitionError(from, to);
    }
  }

  /** Drives the host-facing "what can I do next" affordances. */
  allowedFrom(from: ModerationStatus): readonly ModerationStatus[] {
    return [...(this.transitions.get(from) ?? [])];
  }
}
