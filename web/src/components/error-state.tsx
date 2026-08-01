'use client';

import Link from 'next/link';

/**
 * The shared face of a caught render error. Error boundaries in the App Router
 * must be client components, so this stays presentational and takes the
 * boundary's `reset` as a prop.
 *
 * Tone matters here: say what failed and what the reader can do about it. The
 * digest is the only thread back to the server log, so it is always shown.
 */
export function ErrorState({
  title = 'Something broke on our side',
  description = 'This view failed to load. It is usually temporary — try again, and if it keeps happening the reference below will help us trace it.',
  reset,
  digest,
  homeHref = '/',
  homeLabel = 'Back to start',
}: {
  title?: string;
  description?: string;
  reset?: () => void;
  digest?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/10 text-lg font-semibold text-rose-500 ring-1 ring-inset ring-rose-500/20"
      >
        !
      </span>

      <h1 className="mt-5 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-taupe-500 dark:text-zinc-400">
        {description}
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 dark:bg-coral-600 dark:hover:bg-coral-500"
          >
            Try again
          </button>
        )}
        <Link
          href={homeHref}
          className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium transition-colors hover:border-coral-400 dark:border-white/[0.08] dark:hover:border-coral-500"
        >
          {homeLabel}
        </Link>
      </div>

      {digest && (
        <p className="mt-8 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
          Reference: {digest}
        </p>
      )}
    </div>
  );
}
