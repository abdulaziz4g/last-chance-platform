'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * The five guest sections, mirroring the mobile shell.
 *
 * Routes reuse what already exists rather than minting parallel ones: Explore
 * is `/discover` and Trips is `/bookings`, both of which are real pages with
 * real data. Only Wishlists, Messages and Profile are new, because only those
 * had nowhere to point.
 *
 * Admin and host routes are deliberately NOT here. They are an operator
 * console with their own shells, and folding them into a guest tab bar would
 * put the ledger one tap from a wishlist.
 */
const SECTIONS = [
  { href: '/discover', label: 'Explore', icon: SearchIcon },
  { href: '/wishlists', label: 'Wishlists', icon: HeartIcon },
  { href: '/bookings', label: 'Trips', icon: TripIcon },
  { href: '/messages', label: 'Messages', icon: ChatIcon },
  { href: '/profile', label: 'Profile', icon: PersonIcon },
] as const;

/**
 * Bottom bar on a phone, inline row on a desktop.
 *
 * One component rather than two, because the SET of destinations is the thing
 * that must not drift between breakpoints — a tab that exists only on mobile
 * is a page desktop users cannot reach.
 */
export function GuestNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop: inline, in the flow, above the content. */}
      <nav className="hidden gap-1 md:flex" aria-label="Sections">
        {SECTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
              isActive(href)
                ? 'bg-sand-200 font-semibold text-ink-900 dark:bg-white/[0.08] dark:text-cream-100'
                : 'text-taupe-500 hover:text-ink-900 dark:text-zinc-400 dark:hover:text-cream-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile: fixed to the bottom edge. `pb-[env(safe-area-inset-bottom)]`
          keeps the labels clear of the iPhone home indicator, which otherwise
          sits directly on top of them. */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-white/[0.06] dark:bg-ink-900"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
          {SECTIONS.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] transition-colors ${
                  isActive(href)
                    ? 'text-coral-500'
                    : 'text-taupe-500 dark:text-zinc-400'
                }`}
              >
                {/* Filled when active, outline when not — the weight carries
                    the selection as well as the colour, which is what keeps it
                    legible for someone who cannot distinguish coral from
                    taupe. */}
                <Icon className="h-5 w-5" filled={isActive(href)} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/**
 * Spacer for the fixed bar.
 *
 * Without it the last card on every page sits underneath the nav and cannot be
 * tapped — the classic fixed-footer bug, and invisible on a desktop viewport
 * where the bar is hidden.
 */
export function GuestNavSpacer() {
  return <div aria-hidden className="h-20 md:hidden" />;
}

type IconProps = { className?: string; filled?: boolean };

function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon({ className, filled }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" strokeLinejoin="round" />
    </svg>
  );
}

function TripIcon({ className, filled }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon({ className, filled }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" strokeLinejoin="round" />
    </svg>
  );
}

function PersonIcon({ className, filled }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
    </svg>
  );
}
