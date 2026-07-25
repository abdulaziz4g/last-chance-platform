'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useParams } from 'next/navigation';
import { claimDealAction } from './actions';

function tomorrow(h: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(h, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

const inputCls =
  'mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-900 dark:focus:border-brass-500';

export default function ClaimDealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const [state, formAction, pending] = useActionState(claimDealAction, null);

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <header className="mb-8">
        <Link href="/discover" className="text-[13px] font-semibold tracking-[0.32em]">
          LAST&nbsp;CHANCE
        </Link>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-brass-500 dark:text-brass-400">
          Claim flash deal
        </p>
      </header>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="dealId" value={dealId} />

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {state.error}
          </p>
        )}

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

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Check-in
              </span>
              <input
                name="checkInUtc"
                type="datetime-local"
                required
                defaultValue={tomorrow(10)}
                className={inputCls}
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
                className={inputCls}
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
              className={inputCls}
            />
          </label>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brass-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brass-600 disabled:opacity-50 dark:bg-brass-600 dark:hover:bg-brass-500"
        >
          {pending ? 'Claiming deal...' : 'Claim deal & pay'}
        </button>

        <p className="text-center text-[11px] text-zinc-400">
          Claiming places a discounted 10-minute hold. You&apos;ll complete payment on the next screen.
        </p>
      </form>
    </main>
  );
}
