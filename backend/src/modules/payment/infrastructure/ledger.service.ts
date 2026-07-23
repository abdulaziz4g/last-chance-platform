import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { InvariantViolationError } from '../../../common/errors/domain-errors';
import { LedgerAccount, LedgerLeg } from '../domain/types';

/**
 * Double-entry escrow ledger writer. Every money movement posts one balanced
 * group of legs INSIDE the same transaction as the state change it accounts
 * for — a payment can never be captured without its escrow entry existing.
 *
 * Balance is asserted twice: here (fail fast, clear stack trace) and by the
 * DEFERRED database trigger at COMMIT (db 0007 — the authority).
 */
@Injectable()
export class LedgerService {
  async postGroup(
    client: PoolClient,
    currency: string,
    legs: LedgerLeg[],
  ): Promise<string> {
    const debits = legs
      .filter((l) => l.direction === 'DEBIT')
      .reduce((s, l) => s + l.amountMinor, 0);
    const credits = legs
      .filter((l) => l.direction === 'CREDIT')
      .reduce((s, l) => s + l.amountMinor, 0);
    if (debits !== credits || legs.length < 2) {
      throw new InvariantViolationError(
        `Refusing unbalanced ledger group: debits=${debits} credits=${credits}`,
      );
    }

    const groupId = randomUUID();
    for (const leg of legs) {
      if (leg.amountMinor <= 0) continue; // zero legs are meaningless — skip
      await client.query(
        `INSERT INTO ledger_entries
           (entry_group_id, account, direction, amount_minor, currency,
            booking_id, payment_id, payout_id, host_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          groupId,
          leg.account,
          leg.direction,
          leg.amountMinor,
          currency,
          leg.bookingId ?? null,
          leg.paymentId ?? null,
          leg.payoutId ?? null,
          leg.hostId ?? null,
          leg.description,
        ],
      );
    }
    return groupId;
  }

  /** Net balance per account (credits minus debits) — reconciliation views. */
  async accountBalance(
    client: PoolClient,
    account: LedgerAccount,
    currency: string,
  ): Promise<number> {
    const res = await client.query<{ balance: number }>(
      `SELECT COALESCE(
         sum(CASE direction WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END),
         0
       )::bigint AS balance
       FROM ledger_entries
       WHERE account = $1 AND currency = $2`,
      [account, currency],
    );
    return res.rows[0]?.balance ?? 0;
  }
}
