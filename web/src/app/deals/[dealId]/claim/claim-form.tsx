'use client';

import { useActionState, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { claimDealAction } from './actions';
import { useActionToast } from '@/components/toast';
import { RateLimitNotice, useRetryAfter } from '@/components/rate-limit';
import { guestTimeZone, localInputAtHour, localInputToIso } from '@/lib/local-time';

const inputCls =
  'mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-900 dark:focus:border-brass-500';

/**
 * The interactive half of the claim page — see `book-form.tsx` for why this is
 * split from its page rather than sharing a layout.
 */
export function ClaimDealForm() {
  const { dealId } = useParams<{ dealId: string }>();
  const [state, formAction, pending] = useActionState(claimDealAction, null);
  useActionToast(state);
  const retryIn = useRetryAfter(state);
  const throttled = retryIn > 0;

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [zone, setZone] = useState('');

  // Seeded after mount: this component pre-renders on the server, which has no
  // business deciding what "10:00" means to the guest.
  useEffect(() => {
    setCheckIn(localInputAtHour(1, 10));
    setCheckOut(localInputAtHour(1, 14));
    setZone(guestTimeZone());
  }, []);

  const checkInIso = checkIn ? localInputToIso(checkIn) : null;
  const checkOutIso = checkOut ? localInputToIso(checkOut) : null;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="dealId" value={dealId} />

      <fieldset className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/[0.06] dark:bg-ink-900">
        <legend className="px-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Stay details
        </legend>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Stay type
          </span>
          <select name="bookingType" defaultValue="HOURLY" className={inputCls}>
            <option value="HOURLY">Hourly</option>
            <option value="NIGHTLY">Nightly</option>
          </select>
        </label>

        {/* Unnamed on purpose — see the hidden instants below. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Check-in
            </span>
            <input
              type="datetime-local"
              required
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Check-out
            </span>
            <input
              type="datetime-local"
              required
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <input type="hidden" name="checkInUtc" value={checkInIso ?? ''} />
        <input type="hidden" name="checkOutUtc" value={checkOutIso ?? ''} />
        {zone && (
          <p className="text-[11px] text-zinc-400">
            Times shown in your local zone ({zone}).
          </p>
        )}

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Guests
          </span>
          <input
            name="guestsCount"
            type="number"
            min={1}
            max={50}
            defaultValue={2}
            required
            className={inputCls}
          />
        </label>
      </fieldset>

      <RateLimitNotice secondsLeft={retryIn} action="claim again" />

      <button
        type="submit"
        disabled={pending || throttled}
        className="w-full rounded-lg bg-brass-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brass-600 disabled:opacity-50 dark:bg-brass-600 dark:hover:bg-brass-500"
      >
        {pending
          ? 'Claiming deal...'
          : throttled
            ? `Try again in ${retryIn}s`
            : 'Claim deal & pay'}
      </button>

      <p className="text-center text-[11px] text-zinc-400">
        Claiming places a discounted 10-minute hold. You&apos;ll complete payment
        on the next screen.
      </p>
    </form>
  );
}
