import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';

export interface NavItem {
  href: string;
  label: string;
}

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
  return (
    <div className="flex min-h-dvh">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-zinc-200 bg-white px-6 py-8 dark:border-white/[0.06] dark:bg-ink-900">
        <Link href="/" className="block">
          <span className="text-[15px] font-semibold tracking-[0.32em]">
            LAST&nbsp;CHANCE
          </span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.24em] text-brass-500 dark:text-brass-400">
            {area}
          </span>
        </Link>

        <nav className="mt-10 flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <ThemeToggle />
          {userEmail && (
            <div className="space-y-1">
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {userEmail}
              </p>
              {logoutAction && (
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    Sign out
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="ml-60 w-full px-10 py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
