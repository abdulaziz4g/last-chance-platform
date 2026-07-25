'use client';

import { useActionState } from 'react';
import { createDealAction } from './actions';
import type { HostUnit } from '@/lib/api';
import { Card } from '@/components/ui';

function inOneHour(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function inFourHours(): string {
  const d = new Date();
  d.setHours(d.getHours() + 4, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

const inputCls =
  'mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-brass-400 dark:border-white/[0.08] dark:bg-ink-950 dark:focus:border-brass-500';

export function DealForm({ units }: { units: HostUnit[] }) {
  const [state, formAction, pending] = useActionState(createDealAction, null);

  return (
    <Card className="p-5">
      <form action={formAction} className="space-y-4">
        {state?.error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {state.error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Starts at
            </span>
            <input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={inOneHour()}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Ends at
            </span>
            <input
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={inFourHours()}
              className={inputCls}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brass-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brass-600 disabled:opacity-50 dark:bg-brass-600 dark:hover:bg-brass-500"
        >
          {pending ? 'Creating...' : 'Create deal'}
        </button>
      </form>
    </Card>
  );
}
