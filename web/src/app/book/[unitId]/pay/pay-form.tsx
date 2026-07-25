'use client';

import { useActionState } from 'react';
import { payAction } from '../actions';
import { useActionToast } from '@/components/toast';

export function PayForm({
  bookingId,
  unitId,
}: {
  bookingId: string;
  unitId: string;
}) {
  const [state, formAction, pending] = useActionState(payAction, null);
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="unitId" value={unitId} />

      <fieldset className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/[0.06] dark:bg-ink-900">
        <legend className="px-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Payment method
        </legend>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:border-brass-400 has-[:checked]:border-brass-500 has-[:checked]:bg-brass-500/5 dark:border-white/[0.08] dark:hover:border-brass-500 dark:has-[:checked]:border-brass-500">
          <input
            type="radio"
            name="method"
            value="MADA"
            defaultChecked
            className="accent-brass-500"
          />
          <div>
            <p className="text-sm font-medium">Mada</p>
            <p className="text-[11px] text-zinc-500">Saudi debit network</p>
          </div>
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:border-brass-400 has-[:checked]:border-brass-500 has-[:checked]:bg-brass-500/5 dark:border-white/[0.08] dark:hover:border-brass-500 dark:has-[:checked]:border-brass-500">
          <input
            type="radio"
            name="method"
            value="CARD"
            className="accent-brass-500"
          />
          <div>
            <p className="text-sm font-medium">Credit / Debit Card</p>
            <p className="text-[11px] text-zinc-500">Visa, Mastercard</p>
          </div>
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:border-brass-400 has-[:checked]:border-brass-500 has-[:checked]:bg-brass-500/5 dark:border-white/[0.08] dark:hover:border-brass-500 dark:has-[:checked]:border-brass-500">
          <input
            type="radio"
            name="method"
            value="STC_PAY"
            className="accent-brass-500"
          />
          <div>
            <p className="text-sm font-medium">STC Pay</p>
            <p className="text-[11px] text-zinc-500">Mobile wallet</p>
          </div>
        </label>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brass-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brass-600 disabled:opacity-50 dark:bg-brass-600 dark:hover:bg-brass-500"
      >
        {pending ? 'Processing payment...' : 'Pay now'}
      </button>
    </form>
  );
}
