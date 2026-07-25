import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Console chrome. Below `lg` the sidebar becomes a stacked top bar with a
 * horizontally scrollable nav — a fixed 240px rail leaves nothing for content
 * on a phone. From `lg` up it is the rail it was designed as.
 */
export function Shell({
  area,
  nav,
  children,
  userEmail,
  logoutAction,
}: {
  area: string;
  nav: NavItem[];
  children: ReactNode;
  userEmail?: string;
  logoutAction?: () => Promise<void>;
}) {
  const signOut = logoutAction ? (
    <form action={logoutAction}>
      <button
        type="submit"
        className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
      >
        Sign out
      </button>
    </form>
  ) : null;

  return (
    <div className="min-h-dvh">
      <aside className="border-b border-zinc-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-ink-900 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
        <div className="flex items-center justify-between gap-3 lg:block">
          <Link href="/" className="block min-w-0">
            <span className="block truncate text-[15px] font-semibold tracking-[0.2em] sm:tracking-[0.32em]">
              LAST&nbsp;CHANCE
            </span>
            <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-[0.18em] text-brass-500 sm:tracking-[0.24em] dark:text-brass-400">
              {area}
            </span>
          </Link>

          {/* Compact controls ride in the top bar on small screens. */}
          <div className="flex shrink-0 items-center gap-3 lg:hidden">
            <ThemeToggle compact />
            {signOut}
          </div>
        </div>

        <nav className="-mx-5 mt-4 flex gap-1 overflow-x-auto px-5 pb-1 lg:mx-0 lg:mt-10 lg:flex-col lg:overflow-x-visible lg:px-0 lg:pb-0">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* On the rail these sit at the foot; on mobile they are already above. */}
        <div className="mt-auto hidden space-y-4 lg:block">
          <ThemeToggle />
          {userEmail && (
            <div className="space-y-1">
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {userEmail}
              </p>
              {signOut}
            </div>
          )}
        </div>
      </aside>

      <main className="w-full px-5 py-8 lg:ml-60 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
