'use client';

import { useState } from 'react';

const FILTERS = ['All', 'Travelling', 'Support'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The filter pills and the list they filter.
 *
 * A client component only because the pills hold selection state — the page
 * around it stays a server component. The list is empty for every filter,
 * since there is no conversation API; the pills are wired to state so the
 * interaction is real even though there is nothing to sift.
 */
export function MessageFilters() {
  const [active, setActive] = useState<Filter>('All');

  return (
    <>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((filter) => {
          const selected = filter === active;
          return (
            <button
              key={filter}
              type="button"
              onClick={() => setActive(filter)}
              aria-pressed={selected}
              className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
                selected
                  ? 'bg-ink-900 font-medium text-white dark:bg-cream-100 dark:text-ink-900'
                  : 'bg-sand-200 text-ink-900 hover:bg-sand-300 dark:bg-white/[0.06] dark:text-cream-100'
              }`}
            >
              {filter}
            </button>
          );
        })}
      </div>

      <div className="mt-16 text-center">
        <svg
          viewBox="0 0 24 24"
          className="mx-auto h-11 w-11 stroke-sand-300 dark:stroke-white/20"
          fill="none"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" strokeLinejoin="round" />
        </svg>
        <p className="mt-3 text-lg font-semibold">No messages yet</p>
        <p className="mt-1 text-sm text-taupe-500 dark:text-zinc-400">
          Messages with hosts and support appear here.
        </p>
      </div>
    </>
  );
}
