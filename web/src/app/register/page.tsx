'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction } from './actions';
import { RateLimitNotice, useRetryAfter } from '@/components/rate-limit';

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, null);
  const retryIn = useRetryAfter(state);
  const throttled = retryIn > 0;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <h1 className="text-center text-2xl font-semibold tracking-[0.35em]">
        LAST&nbsp;CHANCE
      </h1>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.28em] text-coral-500 dark:text-coral-400">
        Create your account
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
            Full name
          </span>
          <input
            name="fullName"
            type="text"
            required
            autoComplete="name"
            className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-coral-400 dark:border-white/[0.08] dark:bg-ink-900 dark:focus:border-coral-500"
          />
        </label>

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
            minLength={10}
            autoComplete="new-password"
            className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-coral-400 dark:border-white/[0.08] dark:bg-ink-900 dark:focus:border-coral-500"
          />
          <span className="mt-1 block text-[11px] text-zinc-400">
            At least 10 characters
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-taupe-500 dark:text-zinc-400">
            Confirm password
          </span>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-coral-400 dark:border-white/[0.08] dark:bg-ink-900 dark:focus:border-coral-500"
          />
        </label>

        <button
          type="submit"
          disabled={pending || throttled}
          className="w-full rounded-lg bg-coral-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 disabled:opacity-50 dark:bg-coral-600 dark:hover:bg-coral-500"
        >
          {pending
            ? 'Creating account...'
            : throttled
              ? `Try again in ${retryIn}s`
              : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-taupe-500 dark:text-zinc-400">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-coral-500 transition-colors hover:text-coral-600 dark:text-coral-400 dark:hover:text-coral-300"
        >
          Sign in →
        </Link>
      </p>
    </main>
  );
}
