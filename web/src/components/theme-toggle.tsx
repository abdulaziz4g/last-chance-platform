'use client';

import { useCallback, useEffect, useState } from 'react';

/** Class-strategy theme switch; the root layout's inline script applies the
 *  persisted choice before hydration so there is never a flash. */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('lc-theme', next ? 'dark' : 'light');
    setDark(next);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-brass-500 hover:text-brass-600 dark:border-white/10 dark:text-zinc-300 dark:hover:border-brass-400 dark:hover:text-brass-300"
    >
      {dark === null ? '…' : dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
