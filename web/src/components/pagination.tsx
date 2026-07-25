import Link from 'next/link';

/**
 * Page navigation that preserves the rest of the query string — filters and
 * sort must survive paging, or page 2 quietly shows a different search.
 *
 * Rendered as links rather than buttons: a result page is a place, so it
 * should be shareable, bookmarkable and openable in a new tab.
 */

function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'page' && value) query.set(key, value);
  }
  if (page > 1) query.set('page', String(page));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Page numbers around the current one, with gaps marked by null. */
function windowed(current: number, last: number): (number | null)[] {
  if (last <= 7) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, last, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < last) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

const BASE =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-xs font-medium transition-colors';

export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;

  const current = Math.min(Math.max(1, page), last);
  const first = (current - 1) * pageSize + 1;
  const upTo = Math.min(current * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex flex-wrap items-center justify-between gap-4"
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <span className="tnum">
          {first}–{upTo}
        </span>{' '}
        of <span className="tnum">{total}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1">
        {current > 1 && (
          <Link
            href={pageHref(basePath, params, current - 1)}
            rel="prev"
            className={`${BASE} border border-zinc-200 hover:border-brass-400 dark:border-white/[0.08] dark:hover:border-brass-500`}
          >
            ← Prev
          </Link>
        )}

        {windowed(current, last).map((p, i) =>
          p === null ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="px-1 text-xs text-zinc-400"
            >
              …
            </span>
          ) : p === current ? (
            <span
              key={p}
              aria-current="page"
              className={`${BASE} bg-brass-500 text-white dark:bg-brass-600`}
            >
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={pageHref(basePath, params, p)}
              className={`${BASE} border border-zinc-200 hover:border-brass-400 dark:border-white/[0.08] dark:hover:border-brass-500`}
            >
              {p}
            </Link>
          ),
        )}

        {current < last && (
          <Link
            href={pageHref(basePath, params, current + 1)}
            rel="next"
            className={`${BASE} border border-zinc-200 hover:border-brass-400 dark:border-white/[0.08] dark:hover:border-brass-500`}
          >
            Next →
          </Link>
        )}
      </div>
    </nav>
  );
}
