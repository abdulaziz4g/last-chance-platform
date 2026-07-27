'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useParams } from 'next/navigation';
import { holdAction } from './actions';
import { useActionToast } from '@/components/toast';
import { RateLimitNotice, useRetryAfter } from '@/components/rate-limit';

function tomorrow(h: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(h, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function BookPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const [state, formAction, pending] = useActionState(holdAction, null);
  useActionToast(state);
  const retryIn = useRetryAfter(state);
  const throttled = retryIn > 0;

  return (
    <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <Link href="/discover" className="text-[13px] font-semibold tracking-[0.32em]">
          LAST&nbsp;CHANCE
        </Link>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-brass-500 dark:text-brass-400">
          Book a stay
        </p>
      </header>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="unitId" value={unitId} />

        <fieldset className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/[0.06] dark:bg-ink-900">
          <legend className="px-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Stay details
          </legend>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Stay type
            </span>
            <select
              name="bookingType"
              defaultValue="HOURLY"
              className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
            >
              <option value="HOURLY">Hourly</option>
              <option value="NIGHTLY">Nightly</option>
            </select>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Check-in
              </span>
              <input
                name="checkInUtc"
                type="datetime-local"
                required
                defaultValue={tomorrow(10)}
                className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Check-out
              </span>
              <input
                name="checkOutUtc"
                type="datetime-local"
                required
                defaultValue={tomorrow(14)}
                className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
              />
            </label>
          </div>

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
              className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
            />
          </label>
        </fieldset>

        <RateLimitNotice secondsLeft={retryIn} action="place a hold" />

        <button
          type="submit"
          disabled={pending || throttled}
          className="w-full rounded-lg bg-brass-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brass-600 disabled:opacity-50 dark:bg-brass-600 dark:hover:bg-brass-500"
        >
          {pending
            ? 'Placing hold...'
            : throttled
              ? `Try again in ${retryIn}s`
              : 'Place 10-minute hold'}
        </button>

        <p className="text-center text-[11px] text-zinc-400">
          A hold reserves the unit for 10 minutes while you complete payment.
        </p>
      </form>
    </main>
  );
}
