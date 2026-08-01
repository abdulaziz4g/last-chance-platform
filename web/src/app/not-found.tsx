import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <p className="text-[13px] font-semibold tracking-[0.32em]">
        LAST&nbsp;CHANCE
      </p>
      <h1 className="mt-6 text-lg font-semibold">This page does not exist</h1>
      <p className="mt-2 text-sm leading-relaxed text-taupe-500 dark:text-zinc-400">
        The link may be out of date, or the stay you were looking at is no
        longer listed.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/discover"
          className="rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 dark:bg-coral-600 dark:hover:bg-coral-500"
        >
          Browse stays
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium transition-colors hover:border-coral-400 dark:border-white/[0.08] dark:hover:border-coral-500"
        >
          Back to start
        </Link>
      </div>
    </main>
  );
}
