'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  adjustAction,
  holdPayoutAction,
  releasePayoutAction,
  retryPayoutAction,
  type EscrowActionState,
} from './actions';

const ACCOUNTS = [
  ['PLATFORM_ESCROW', 'Platform escrow'],
  ['HOST_PAYABLE', 'Host payable'],
  ['PLATFORM_REVENUE', 'Platform revenue'],
  ['TAX_PAYABLE', 'Tax payable'],
  ['GUEST_REFUND_CLEARING', 'Guest refund clearing'],
  ['PROVIDER_CLEARING', 'Provider clearing'],
] as const;

function Submit({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'danger' }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        tone === 'danger'
          ? 'rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50'
          : 'rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-600'
      }
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

function Feedback({ state }: { state: EscrowActionState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="mt-2 rounded-lg border border-red-500/40 bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className="mt-2 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
      {state.ok}
    </p>
  );
}

/**
 * Manual escrow adjustment.
 *
 * The copy states plainly that this posts a NEW entry rather than editing an
 * old one. That is not decoration: an operator who believes they are "fixing"
 * a number will reach for this expecting the mistake to vanish, and finding
 * both entries in the ledger afterwards would look like a bug rather than the
 * guarantee it is.
 */
export function AdjustmentForm() {
  const [state, action] = useActionState(adjustAction, null);

  return (
    <form action={action} className="space-y-3">
      <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        This posts a <strong>compensating entry</strong>. The ledger is
        append-only: the original entries stay exactly where they are, and this
        correction appears alongside them. Both remain visible forever.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fromAccount" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Debit (money leaves)
          </label>
          <select
            id="fromAccount"
            name="fromAccount"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="" disabled>Choose…</option>
            {ACCOUNTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="toAccount" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Credit (money arrives)
          </label>
          <select
            id="toAccount"
            name="toAccount"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="" disabled>Choose…</option>
            {ACCOUNTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="amountMinor" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Amount (minor units — halalas)
          </label>
          <input
            id="amountMinor"
            name="amountMinor"
            inputMode="numeric"
            required
            placeholder="e.g. 12000 = 120.00"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>

        <div>
          <label htmlFor="currency" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Currency
          </label>
          <input
            id="currency"
            name="currency"
            required
            defaultValue="SAR"
            maxLength={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm uppercase dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor="bookingId" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Booking id (optional — links the correction to a stay)
        </label>
        <input
          id="bookingId"
          name="bookingId"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
        />
      </div>

      <div>
        <label htmlFor="reason" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Reason (required, recorded permanently)
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required
          minLength={10}
          placeholder="What went wrong, and what is this correcting?"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
      </div>

      <Submit label="Post compensating entry" tone="danger" />
      <Feedback state={state} />
    </form>
  );
}

/** Hold / release / retry for one payout. Which control shows follows status. */
export function PayoutControls({
  payoutId,
  status,
}: {
  payoutId: string;
  status: string;
}) {
  const [holdState, hold] = useActionState(holdPayoutAction, null);
  const [releaseState, release] = useActionState(releasePayoutAction, null);
  const [retryState, retry] = useActionState(retryPayoutAction, null);

  const canHold = status === 'PENDING' || status === 'SCHEDULED';
  const canRelease = status === 'ON_HOLD';
  const canRetry = status === 'FAILED';

  if (!canHold && !canRelease && !canRetry) {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  const [action, label, tone, state] = canHold
    ? ([hold, 'Hold', 'danger', holdState] as const)
    : canRelease
      ? ([release, 'Release', 'neutral', releaseState] as const)
      : ([retry, 'Retry', 'neutral', retryState] as const);

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="payoutId" value={payoutId} />
      <input
        name="reason"
        required
        minLength={10}
        placeholder="Reason…"
        aria-label={`Reason to ${label.toLowerCase()} this payout`}
        className="w-40 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
      />
      <Submit label={label} tone={tone} />
      <Feedback state={state} />
    </form>
  );
}
