import Link from 'next/link';
import { getSession } from '@/lib/session';

export default async function Home() {
  const session = await getSession();
  const isAdmin = session?.role === 'ADMIN';
  const isHost = session?.actorType === 'HOST' || isAdmin;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <h1 className="text-center text-2xl font-semibold tracking-[0.35em]">
        LAST&nbsp;CHANCE
      </h1>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.28em] text-brass-500 dark:text-brass-400">
        Platform console
      </p>

      <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/discover"
          className="group rounded-2xl border border-zinc-200 bg-white p-8 transition-all hover:border-brass-400 hover:shadow-lg dark:border-white/[0.06] dark:bg-ink-900 dark:hover:border-brass-500/50"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.18em]">
            Discover
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Search stays by city, geo radius, price and amenities.
          </p>
          <p className="mt-6 text-xs text-brass-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brass-400">
            Enter →
          </p>
        </Link>

        {isHost && (
          <Link
            href="/host"
            className="group rounded-2xl border border-zinc-200 bg-white p-8 transition-all hover:border-brass-400 hover:shadow-lg dark:border-white/[0.06] dark:bg-ink-900 dark:hover:border-brass-500/50"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">
              Host studio
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Units, bookings, earnings and payouts for property hosts.
            </p>
            <p className="mt-6 text-xs text-brass-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brass-400">
              Enter →
            </p>
          </Link>
        )}

        {isAdmin && (
          <Link
            href="/admin"
            className="group rounded-2xl border border-zinc-200 bg-white p-8 transition-all hover:border-brass-400 hover:shadow-lg dark:border-white/[0.06] dark:bg-ink-900 dark:hover:border-brass-500/50"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">
              Operations
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Live bookings, payments, escrow ledger and webhook health.
            </p>
            <p className="mt-6 text-xs text-brass-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brass-400">
              Enter →
            </p>
          </Link>
        )}
      </div>

      {!session && (
        <Link
          href="/login"
          className="mt-8 text-sm text-brass-500 transition-colors hover:text-brass-600 dark:text-brass-400 dark:hover:text-brass-300"
        >
          Sign in →
        </Link>
      )}
    </main>
  );
}
