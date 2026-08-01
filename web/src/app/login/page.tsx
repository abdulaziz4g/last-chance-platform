'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from './actions';
import { RateLimitNotice, useRetryAfter } from '@/components/rate-limit';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const retryIn = useRetryAfter(state);
  const throttled = retryIn > 0;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <h1 className="text-center text-2xl font-semibold tracking-[0.35em]">
        LAST&nbsp;CHANCE
      </h1>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.28em] text-coral-500 dark:text-coral-400">
        Sign in to continue
      </p>

      <form action={formAction} className="mt-10 w-full max-w-sm space-y-4">
        {throttled ? (
          <RateLimitNotice secondsLeft={retryIn} action="try again" />
        ) : (
          state?.error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {state.error}
            </p>
          )
        )}

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
            Email
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-coral-400 dark:border-white/[0.08] dark:bg-ink-900 dark:focus:border-coral-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
            Password
          </span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-coral-400 dark:border-white/[0.08] dark:bg-ink-900 dark:focus:border-coral-500"
          />
        </label>

        <button
          type="submit"
          disabled={pending || throttled}
          className="w-full rounded-lg bg-coral-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50 dark:bg-coral-600 dark:hover:bg-coral-500"
        >
          {pending
            ? 'Signing in...'
            : throttled
              ? `Try again in ${retryIn}s`
              : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-taupe-500 dark:text-zinc-400">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="text-coral-500 transition-colors hover:text-coral-600 dark:text-coral-400 dark:hover:text-coral-300"
        >
          Create one →
        </Link>
      </p>
    </main>
  );
}
