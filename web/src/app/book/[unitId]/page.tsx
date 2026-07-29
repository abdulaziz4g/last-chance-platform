'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { holdAction } from './actions';
import { useActionToast } from '@/components/toast';
import { RateLimitNotice, useRetryAfter } from '@/components/rate-limit';
import { AvailabilityWatch } from './availability-watch';
import { guestTimeZone, localInputAtHour, localInputToIso } from '@/lib/local-time';

export default function BookPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const [state, formAction, pending] = useActionState(holdAction, null);
  useActionToast(state);
  const retryIn = useRetryAfter(state);
  const throttled = retryIn > 0;

  // Controlled so the availability watcher can tell whether an incoming hold
  // actually collides with the window being filled in.
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [zone, setZone] = useState('');

  // Seeded after mount, not during render: these times are the *guest's*, and
  // this component still pre-renders on the server, where that zone is unknown.
  useEffect(() => {
    setCheckIn(localInputAtHour(1, 10));
    setCheckOut(localInputAtHour(1, 14));
    setZone(guestTimeZone());
  }, []);

  // The wire format is a UTC instant. Converting here — in the browser — is
  // what makes "10:00" mean 10:00 to the guest regardless of where the server
  // happens to be running.
  const checkInIso = checkIn ? localInputToIso(checkIn) : null;
  const checkOutIso = checkOut ? localInputToIso(checkOut) : null;

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

          {/* Visible fields are unnamed: they hold the guest's wall clock, and
              only the converted instants below are fit to send. */}
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
                className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
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
                className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
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
              className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500"
            />
          </label>
        </fieldset>

        <AvailabilityWatch
          unitId={unitId}
          checkIn={checkIn}
          checkOut={checkOut}
        />

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
