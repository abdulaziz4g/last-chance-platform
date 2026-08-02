import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { GuestHeader } from '@/components/guest-header';
import { GuestNav, GuestNavSpacer } from '@/components/guest-nav';
import { getSession } from '@/lib/session';
import { logoutAction } from '@/app/login/actions';

export const metadata: Metadata = { title: 'Profile' };

/**
 * The account section: a promotional banner over a list of settings.
 *
 * Rows whose destination does not exist yet are rendered as plain text rather
 * than links. A link that goes nowhere is worse than one that is visibly not
 * ready — the first wastes a click and looks broken, the second reads as
 * "coming soon".
 *
 * Log out is the exception: it is real, wired to the existing action, and
 * hidden entirely when there is no session rather than shown inert.
 */
export default async function ProfilePage() {
  const session = await getSession();

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <GuestHeader area="Profile" />
      <GuestNav />

      <h1 className="mt-6 font-display text-4xl">Profile</h1>

      {/* Sand rather than white, so it reads as a promotion instead of another
          list item. */}
      <section className="mt-6 flex items-center gap-4 rounded-card bg-sand-200 p-5 dark:bg-white/[0.05]">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Become a host</h2>
          <p className="mt-1 text-sm text-taupe-500 dark:text-zinc-400">
            It&rsquo;s easy to start hosting and earn extra income.
          </p>
        </div>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white dark:bg-ink-900">
          <svg viewBox="0 0 24 24" className="h-7 w-7 stroke-coral-500" fill="none" strokeWidth="1.5" aria-hidden>
            <path d="M6 21V7a6 6 0 0 1 12 0v14" strokeLinecap="round" />
            <path d="M4 21h16" strokeLinecap="round" />
          </svg>
        </div>
      </section>

      <ul className="mt-8 divide-y divide-sand-200 dark:divide-white/[0.06]">
        <Row label="Account settings" />
        <Row label="Get help" />
        <Row label="View profile" />
        <Row label="Privacy" />
        <Row label="Legal" />
        {session && (
          <li className="py-1">
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center justify-between py-3 text-start text-[15px] transition-colors hover:text-coral-500"
              >
                Log out
                <Chevron />
              </button>
            </form>
          </li>
        )}
      </ul>

      {!session && (
        <p className="mt-8 text-sm text-taupe-500 dark:text-zinc-400">
          <Link href="/login" className="font-medium text-coral-500 hover:underline">
            Sign in
          </Link>{' '}
          to manage your account.
        </p>
      )}

      <GuestNavSpacer />
    </main>
  );
}

function Row({ label, href }: { label: string; href?: string }) {
  const body: ReactNode = (
    <span className="flex items-center justify-between py-4 text-[15px]">
      {label}
      <Chevron />
    </span>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className="block transition-colors hover:text-coral-500">
          {body}
        </Link>
      ) : (
        // Not a link: this destination does not exist yet.
        <span className="block text-taupe-500 dark:text-zinc-400">{body}</span>
      )}
    </li>
  );
}

/** Flips with direction, so it never points out of the reading order. */
function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 stroke-current rtl:-scale-x-100" fill="none" strokeWidth="2" aria-hidden>
      <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
