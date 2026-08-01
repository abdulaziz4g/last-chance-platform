import Link from 'next/link';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { logoutAction } from '@/app/login/actions';
import { ThemeToggle } from './theme-toggle';

/**
 * The header every guest-facing page wears.
 *
 * Guests never see the host or admin shells, which carry their own sign-out, so
 * until this existed the only way out of a session was to happen to be on
 * `/bookings` — the one page that had a bespoke one. Somebody finishing a
 * booking, or just browsing, had no way to leave.
 *
 * A server component so it can read the session cookie directly. On the two
 * routes whose page is a client component it is mounted from a `layout.tsx`
 * instead, which is why the auth control lives here rather than in the pages.
 *
 * `children` are the page's own right-hand links; they sit before the auth
 * control so the rightmost items stay in the same place from page to page.
 */
export async function GuestHeader({
  area,
  children,
}: {
  area: string;
  children?: ReactNode;
}) {
  const session = await getSession();

  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div>
        <Link href="/" className="text-[13px] font-semibold tracking-[0.32em]">
          LAST&nbsp;CHANCE
        </Link>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-coral-500 dark:text-coral-400">
          {area}
        </p>
      </div>

      {/* No `shrink-0` here: this row now carries a third control, and on a
          narrow phone refusing to shrink pushes the page into a horizontal
          scroll. Let it wrap instead. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {children}

        {session ? (
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm whitespace-nowrap text-taupe-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Sign out
            </button>
          </form>
        ) : (
          <Link
            href="/login"
            className="text-sm whitespace-nowrap text-taupe-500 transition-colors hover:text-coral-500 dark:text-zinc-400 dark:hover:text-coral-400"
          >
            Sign in
          </Link>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}
