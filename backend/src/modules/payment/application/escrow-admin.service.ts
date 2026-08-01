import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  PAYMENTS_QUEUE,
  PaymentsJobData,
} from '../../../infrastructure/queue/queue.module';
import { LedgerService } from '../infrastructure/ledger.service';
import { PayoutRepository } from '../infrastructure/payout.repository';
import {
  ValidationFailedError,
  InvariantViolationError,
} from '../../../common/errors/domain-errors';
import type { LedgerAccount, Payout } from '../domain/types';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'EscrowAdminService' });

/** Accounts an operator may move money between by hand. */
const ADJUSTABLE_ACCOUNTS: readonly LedgerAccount[] = [
  'PLATFORM_ESCROW',
  'PLATFORM_REVENUE',
  'HOST_PAYABLE',
  'TAX_PAYABLE',
  'GUEST_REFUND_CLEARING',
  'PROVIDER_CLEARING',
];

export interface EscrowAdjustment {
  /** Money leaves this account. */
  fromAccount: LedgerAccount;
  /** Money arrives in this one. */
  toAccount: LedgerAccount;
  amountMinor: number;
  currency: string;
  /** Free text, mandatory: an unexplained manual money movement is a finding. */
  reason: string;
  bookingId?: string | null;
  hostId?: string | null;
}

/**
 * Manual escrow intervention.
 *
 * THE LOAD-BEARING DECISION: an "override" here never edits or deletes a
 * ledger entry. It cannot — ledger_entries is append-only, enforced by trigger
 * (LC403) and by privilege revocation. So a correction is a COMPENSATING
 * ENTRY: a new balanced group that moves the money the other way, leaving both
 * the original mistake and its correction permanently visible.
 *
 * That is not a limitation to work around, it is the entire point. An
 * accounting system where an operator can make an entry disappear cannot be
 * audited, and "the balance is right because someone fixed it quietly" is not
 * something you can show a regulator. Every intervention below is additive.
 */
@Injectable()
export class EscrowAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ledger: LedgerService,
    private readonly payouts: PayoutRepository,
    @Inject(PAYMENTS_QUEUE) private readonly queue: Queue<PaymentsJobData>,
  ) {}

  /**
   * Posts a two-leg compensating entry. The group is balanced by construction,
   * so the DEFERRED database trigger has nothing to complain about — but it
   * still gets the last word at COMMIT.
   */
  async adjust(adjustment: EscrowAdjustment): Promise<{ entryGroupId: string }> {
    const { fromAccount, toAccount, amountMinor, currency, reason } = adjustment;

    if (!ADJUSTABLE_ACCOUNTS.includes(fromAccount)) {
      throw new ValidationFailedError('Unknown source account', { fromAccount });
    }
    if (!ADJUSTABLE_ACCOUNTS.includes(toAccount)) {
      throw new ValidationFailedError('Unknown destination account', { toAccount });
    }
    if (fromAccount === toAccount) {
      throw new ValidationFailedError(
        'Source and destination accounts must differ',
      );
    }
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new ValidationFailedError(
        'Amount must be a positive integer in minor units',
      );
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationFailedError('Currency must be an ISO-4217 alpha code');
    }
    // Enforced rather than merely encouraged: this is the only field that
    // explains to a future reader why the money moved.
    if (reason.trim().length < 10) {
      throw new ValidationFailedError(
        'A manual adjustment needs a reason of at least 10 characters',
      );
    }

    const entryGroupId = await this.db.transaction(async (client) => {
      const description = `Manual adjustment: ${reason.trim()}`;
      return this.ledger.postGroup(client, currency, [
        {
          account: fromAccount,
          direction: 'DEBIT',
          amountMinor,
          bookingId: adjustment.bookingId ?? undefined,
          hostId: adjustment.hostId ?? undefined,
          description,
        },
        {
          account: toAccount,
          direction: 'CREDIT',
          amountMinor,
          bookingId: adjustment.bookingId ?? undefined,
          hostId: adjustment.hostId ?? undefined,
          description,
        },
      ]);
    });

    log.warn(
      {
        entryGroupId,
        fromAccount,
        toAccount,
        amountMinor,
        currency,
        bookingId: adjustment.bookingId ?? undefined,
      },
      'MANUAL ESCROW ADJUSTMENT posted',
    );
    return { entryGroupId };
  }

  /**
   * Holds a payout that has not left yet. Used when something looks wrong and
   * an operator needs the money to stop moving while they look.
   *
   * No ledger entry: the split already credited HOST_PAYABLE when the stay
   * completed, and holding the transfer does not change what is owed. Writing
   * an entry here would misstate the liability.
   */
  async hold(payoutId: string, reason: string): Promise<Payout> {
    const updated = await this.transitionPayout(payoutId, ['PENDING', 'SCHEDULED'], 'ON_HOLD', reason);
    log.warn({ payoutId, reason }, 'Payout placed on hold');
    return updated;
  }

  /** Releases a held payout back into the queue. */
  async release(payoutId: string, reason: string): Promise<Payout> {
    const updated = await this.transitionPayout(payoutId, ['ON_HOLD'], 'PENDING', reason);
    await this.queue.add('execute-payout', { payoutId });
    log.info({ payoutId, reason }, 'Payout released from hold and re-queued');
    return updated;
  }

  /**
   * Retries a failed transfer. The provider call is idempotent on payoutId and
   * executePayout re-checks state, so a retry that races a late success is a
   * no-op rather than a double payment.
   */
  async retry(payoutId: string, reason: string): Promise<Payout> {
    const updated = await this.transitionPayout(payoutId, ['FAILED'], 'PENDING', reason);
    await this.queue.add('execute-payout', { payoutId });
    log.info({ payoutId, reason }, 'Failed payout re-queued');
    return updated;
  }

  private async transitionPayout(
    payoutId: string,
    from: string[],
    to: string,
    reason: string,
  ): Promise<Payout> {
    if (reason.trim().length < 10) {
      throw new ValidationFailedError(
        'A manual payout intervention needs a reason of at least 10 characters',
      );
    }

    // CAS against the expected states: an operator acting on a stale dashboard
    // must not move a payout that has since settled.
    const res = await this.db.query<{ id: string }>(
      `UPDATE payouts
          SET status = $3::payout_status,
              failure_message = CASE WHEN $3 = 'PENDING' THEN NULL
                                     ELSE failure_message END
        WHERE id = $1 AND status = ANY($2::payout_status[])
        RETURNING id`,
      [payoutId, from, to],
    );
    if (res.rowCount === 0) {
      throw new ValidationFailedError(
        `Payout is not in a state that allows this action (expected ${from.join(' or ')})`,
        { payoutId, expected: from, attempted: to },
      );
    }

    const payout = await this.payouts.findById(payoutId);
    if (!payout) {
      // The row was updated a moment ago; its disappearance is not survivable.
      throw new InvariantViolationError('Payout vanished mid-transition', {
        payoutId,
      });
    }
    log.info({ payoutId, from, to, reason }, 'Manual payout transition');
    return payout;
  }
}
