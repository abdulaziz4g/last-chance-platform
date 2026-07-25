'use client';

import { useActionState, useState } from 'react';
import { cancelBookingAction } from './actions';
import { useActionToast } from '@/components/toast';

/**
 * Two-step cancellation. Cancelling is irreversible and may move money, so
 * the destructive action is never one click away — the first press only opens
 * the panel that explains what will happen.
 */
export function CancelBooking({
  bookingId,
  bookingCode,
  status,
}: {
  bookingId: string;
  bookingCode: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  // Success never lands here — the action redirects and CancelledFlash
  // announces it. Only failures come back as state.
  const [state, formAction, pending] = useActionState(cancelBookingAction, null);
  useActionToast(state);

  // Nothing has been captured before payment completes, so promising a refund
  // there would be wrong — and alarming.
  const paid = status === 'CONFIRMED';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-zinc-500 underline-offset-4 transition-colors hover:text-rose-600 hover:underline dark:text-zinc-400 dark:hover:text-rose-400"
      >
        Cancel booking
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="rounded-lg bg-rose-500/[0.06] px-4 py-3 ring-1 ring-inset ring-rose-500/20">
        <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
          Cancel {bookingCode}?
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          {paid
            ? 'Your payment will be refunded in full. Refunds settle back to your original payment method, usually within a few business days.'
            : 'You have not been charged for this booking, so there is nothing to refund.'}{' '}
          This cannot be undone — the dates are released to other guests
          immediately.
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Reason (optional)
        </span>
        <input
          name="reason"
          type="text"
          maxLength={1000}
          placeholder="Change of plans"
          className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
        >
          {pending ? 'Cancelling…' : 'Yes, cancel booking'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium transition-colors hover:border-zinc-300 disabled:opacity-50 dark:border-white/[0.08] dark:hover:border-white/20"
        >
          Keep booking
        </button>
      </div>
    </form>
  );
}
