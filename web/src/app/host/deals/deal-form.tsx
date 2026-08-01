'use client';

import { useActionState, useEffect, useState } from 'react';
import { createDealAction } from './actions';
import type { HostUnit } from '@/lib/api';
import { Card } from '@/components/ui';
import { useActionToast } from '@/components/toast';
import { guestTimeZone, localInputInHours, localInputToIso } from '@/lib/local-time';

const inputCls =
  'mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-coral-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-coral-500';

export function DealForm({ units }: { units: HostUnit[] }) {
  const [state, formAction, pending] = useActionState(createDealAction, null);
  useActionToast(state);

  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [zone, setZone] = useState('');

  // Seeded after mount — the host's wall clock is not the server's.
  useEffect(() => {
    setStartsAt(localInputInHours(1));
    setEndsAt(localInputInHours(4));
    setZone(guestTimeZone());
  }, []);

  const startsAtIso = startsAt ? localInputToIso(startsAt) : null;
  const endsAtIso = endsAt ? localInputToIso(endsAt) : null;

  return (
    <Card className="p-5">
      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
              Unit
            </span>
            <select name="unitId" required className={inputCls}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.propertyName} — {u.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
              Title
            </span>
            <input
              name="title"
              type="text"
              required
              maxLength={140}
              placeholder="Weekend Flash!"
              className={inputCls}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
              Discount %
            </span>
            <input
              name="discountPct"
              type="number"
              min={5}
              max={90}
              defaultValue={20}
              required
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
              Quantity
            </span>
            <input
              name="quantityTotal"
              type="number"
              min={1}
              max={1000}
              defaultValue={5}
              required
              className={inputCls}
            />
          </label>
        </div>

        {/* Unnamed: the hidden fields below carry the converted instants. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
              Starts at
            </span>
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
              Ends at
            </span>
            <input
              type="datetime-local"
              required
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <input type="hidden" name="startsAt" value={startsAtIso ?? ''} />
        <input type="hidden" name="endsAt" value={endsAtIso ?? ''} />
        {zone && (
          <p className="text-[11px] text-zinc-400">
            Times shown in your local zone ({zone}).
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-coral-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50 dark:bg-coral-600 dark:hover:bg-coral-500"
        >
          {pending ? 'Creating...' : 'Create deal'}
        </button>
      </form>
    </Card>
  );
}
