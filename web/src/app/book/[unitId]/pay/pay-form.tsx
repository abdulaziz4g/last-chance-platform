'use client';

import { useActionState } from 'react';
import { payAction } from '../actions';
import { useActionToast } from '@/components/toast';
import { StripePayment } from '@/components/stripe-payment';

/** Methods offered per provider — MOCK accepts anything, Stripe needs a card. */
const METHODS = [
  { value: 'MADA', label: 'Mada', hint: 'Saudi debit network', card: true },
  { value: 'CARD', label: 'Credit / Debit Card', hint: 'Visa, Mastercard', card: true },
  { value: 'STC_PAY', label: 'STC Pay', hint: 'Mobile wallet', card: false },
];

export function PayForm({
  bookingId,
  unitId,
  provider,
  publishableKey,
  currency,
}: {
  bookingId: string;
  unitId: string;
  provider: 'MOCK' | 'STRIPE';
  publishableKey: string | null;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(payAction, null);
  useActionToast(state);

  // A real PSP answers with a secret instead of completing the payment; the
  // card form replaces the method picker at that point.
  if (state?.stripe && publishableKey) {
    const returnUrl =
      typeof window === 'undefined'
        ? ''
        : `${window.location.origin}/book/confirmation?bookingId=${bookingId}`;

    return (
      <StripePayment
        publishableKey={publishableKey}
        clientSecret={state.stripe.clientSecret}
        returnUrl={returnUrl}
        currency={currency}
      />
    );
  }

  const methods =
    provider === 'STRIPE' ? METHODS.filter((m) => m.card) : METHODS;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="unitId" value={unitId} />

      <fieldset className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/[0.06] dark:bg-ink-900">
        <legend className="px-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Payment method
        </legend>

        {methods.map((m, i) => (
          <label
            key={m.value}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:border-brass-400 has-[:checked]:border-brass-500 has-[:checked]:bg-brass-500/5 dark:border-white/[0.08] dark:hover:border-brass-500 dark:has-[:checked]:border-brass-500"
          >
            <input
              type="radio"
              name="method"
              value={m.value}
              defaultChecked={i === 0}
              className="accent-brass-500"
            />
            <div>
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-[11px] text-zinc-500">{m.hint}</p>
            </div>
          </label>
        ))}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brass-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brass-600 disabled:opacity-50 dark:bg-brass-600 dark:hover:bg-brass-500"
      >
        {pending
          ? 'Processing payment...'
          : provider === 'STRIPE'
            ? 'Continue to card details'
            : 'Pay now'}
      </button>

      {provider === 'MOCK' && (
        <p className="text-center text-[11px] text-zinc-400">
          Test mode — no real payment is taken.
        </p>
      )}
    </form>
  );
}
