'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Stripe card collection via the Payment Element.
 *
 * Stripe.js is fetched from Stripe's CDN on demand rather than bundled. Their
 * terms require the script be served from stripe.com (it is what keeps card
 * data out of our origin and our PCI scope small), so a bundled copy would not
 * be permissible anyway — and while MOCK is the active provider this costs
 * nothing, because the script is never requested.
 *
 * Card details never touch our servers: the element is a cross-origin iframe,
 * and confirmation goes straight from the browser to Stripe. The booking is
 * settled by the webhook that follows, not by anything this component returns.
 */

const STRIPE_JS = 'https://js.stripe.com/v3/';

declare global {
  interface Window {
    Stripe?: (key: string) => StripeLike;
  }
}

interface StripeElement {
  mount: (selector: HTMLElement) => void;
  unmount: () => void;
}

interface StripeElements {
  create: (type: string, options?: Record<string, unknown>) => StripeElement;
  submit: () => Promise<{ error?: { message?: string } }>;
}

interface StripeLike {
  elements: (options: Record<string, unknown>) => StripeElements;
  confirmPayment: (options: {
    elements: StripeElements;
    clientSecret: string;
    confirmParams: { return_url: string };
  }) => Promise<{ error?: { message?: string } }>;
}

let scriptPromise: Promise<void> | null = null;

/** Loads Stripe.js once per page, shared across mounts. */
function loadStripeJs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Stripe) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${STRIPE_JS}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = STRIPE_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Stripe.js'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function StripePayment({
  publishableKey,
  clientSecret,
  returnUrl,
  currency,
}: {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  currency: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<StripeLike | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let element: StripeElement | null = null;

    loadStripeJs()
      .then(() => {
        if (cancelled || !window.Stripe || !mountRef.current) return;

        const stripe = window.Stripe(publishableKey);
        const elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: document.documentElement.classList.contains('dark')
              ? 'night'
              : 'stripe',
            variables: { colorPrimary: '#b49164', borderRadius: '8px' },
          },
        });

        element = elements.create('payment', {
          // Saudi debit runs on mada; surfacing wallets here would promise
          // methods the intent was not created for.
          defaultValues: { billingDetails: { address: { country: 'SA' } } },
        });
        element.mount(mountRef.current);

        stripeRef.current = stripe;
        elementsRef.current = elements;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not reach the payment provider. Please try again.');
        }
      });

    return () => {
      cancelled = true;
      element?.unmount();
    };
  }, [publishableKey, clientSecret, currency]);

  async function pay() {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const submitted = await elements.submit();
    if (submitted.error) {
      setError(submitted.error.message ?? 'Please check your card details.');
      setSubmitting(false);
      return;
    }

    const result = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: returnUrl },
    });

    // Reaching here at all means the redirect did not happen, which for
    // confirmPayment always means failure.
    setError(result.error?.message ?? 'The payment could not be completed.');
    setSubmitting(false);
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      <div
        ref={mountRef}
        className="rounded-card border border-zinc-200 bg-white p-4 dark:border-white/[0.06] dark:bg-ink-900"
      />

      {!ready && !error && (
        <p className="text-center text-xs text-zinc-400">
          Loading secure card entry…
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={!ready || submitting}
        className="w-full rounded-lg bg-coral-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50 dark:bg-coral-600 dark:hover:bg-coral-500"
      >
        {submitting ? 'Confirming…' : 'Pay now'}
      </button>

      <p className="text-center text-[11px] text-zinc-400">
        Card details are handled by Stripe and never reach our servers.
      </p>
    </div>
  );
}
