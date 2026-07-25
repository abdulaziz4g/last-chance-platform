import Link from 'next/link';
import { Card, StatusChip } from '@/components/ui';
import {
  getActiveDeals,
  searchUnits,
  type FlashDealView,
  type SearchParams,
} from '@/lib/api';
import { money } from '@/lib/format';
import { ThemeToggle } from '@/components/theme-toggle';
import { DealStrip } from '@/components/deal-strip';

export const dynamic = 'force-dynamic';

/**
 * Public discovery — OpenSearch-backed. Server Component: filters come in as
 * URL search params, the query runs server-side against the API, results
 * render as cards. This is the guest-facing face of the search phase.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params: SearchParams = {
    text: sp.text || undefined,
    city: sp.city || undefined,
    mode: sp.mode === 'HOURLY' || sp.mode === 'NIGHTLY' ? sp.mode : undefined,
    guests: sp.guests ? Number(sp.guests) : undefined,
    amenities: sp.amenity ? [sp.amenity] : undefined,
    sort:
      sp.sort === 'price_asc' ||
      sp.sort === 'price_desc' ||
      sp.sort === 'rating'
        ? sp.sort
        : undefined,
  };

  // Search failing is the page failing — discover/error.tsx handles it and can
  // offer a retry, which a swallowed message could not. Deals are decorative
  // by comparison, so an outage there just hides the strip.
  const [results, deals] = await Promise.all([
    searchUnits(params),
    getActiveDeals().catch(() => [] as FlashDealView[]),
  ]);

  const modeIsHourly = params.mode !== 'NIGHTLY';

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <Link href="/" className="text-[13px] font-semibold tracking-[0.32em]">
            LAST&nbsp;CHANCE
          </Link>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-brass-500 dark:text-brass-400">
            Discover
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="/bookings"
            className="text-sm whitespace-nowrap text-zinc-500 transition-colors hover:text-brass-500 dark:text-zinc-400 dark:hover:text-brass-400"
          >
            My bookings
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <DealStrip deals={deals} />

      <form className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-5" method="get">
        <input
          name="text"
          defaultValue={sp.text}
          placeholder="Search city, property…"
          className="col-span-2 rounded-xl border border-zinc-300 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-brass-400 dark:border-white/10"
        />
        <select
          name="mode"
          defaultValue={sp.mode ?? ''}
          className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-brass-400 dark:border-white/10 dark:bg-ink-900"
        >
          <option value="">Any stay</option>
          <option value="HOURLY">Hourly</option>
          <option value="NIGHTLY">Nightly</option>
        </select>
        <select
          name="sort"
          defaultValue={sp.sort ?? ''}
          className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-brass-400 dark:border-white/10 dark:bg-ink-900"
        >
          <option value="">Relevance</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
          <option value="rating">Rating</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-brass-400 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-brass-300"
        >
          Search
        </button>
      </form>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {results.total} {results.total === 1 ? 'stay' : 'stays'}
        </p>
        {results.facets.city.slice(0, 6).map((f) => (
          <Link
            key={f.key}
            href={`/discover?city=${encodeURIComponent(f.key)}`}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition-colors hover:border-brass-400 hover:text-brass-600 dark:border-white/10 dark:text-zinc-400"
          >
            {f.key} · {f.count}
          </Link>
        ))}
      </div>

      {results.items.length === 0 ? (
        <Card className="px-6 py-16 text-center text-zinc-500">
          No stays match those filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.items.map((u) => {
            const rate = modeIsHourly ? u.hourlyRateMinor : u.nightlyRateMinor;
            return (
              <Card key={u.unitId} className="flex flex-col p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{u.propertyName}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {u.unitName} · {u.city}
                    </p>
                  </div>
                  {u.instantBook ? <StatusChip status="ACTIVE" /> : null}
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {u.amenities.slice(0, 4).map((a) => (
                    <span
                      key={a}
                      className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300"
                    >
                      {a}
                    </span>
                  ))}
                </div>

                <div className="mt-auto flex items-end justify-between gap-3">
                  <div>
                    <p className="tnum text-lg font-semibold text-brass-500 dark:text-brass-300">
                      {rate != null ? money(rate, u.currency) : '—'}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {modeIsHourly ? 'per hour' : 'per night'} · {u.maxGuests}{' '}
                      guests
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {u.ratingAvg ? (
                      <p className="text-xs text-zinc-500">
                        ★ {u.ratingAvg} ({u.ratingCount})
                      </p>
                    ) : null}
                    {u.distanceKm != null ? (
                      <p className="text-[11px] text-zinc-400">
                        {u.distanceKm} km away
                      </p>
                    ) : null}
                  </div>
                </div>

                <Link
                  href={`/book/${u.unitId}`}
                  className="mt-4 block rounded-lg bg-brass-500 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-brass-600 dark:bg-brass-600 dark:hover:bg-brass-500"
                >
                  Book now
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
