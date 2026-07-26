'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FlashDealView } from '@/lib/api';
import { money } from '@/lib/format';
import { useRealtime } from './use-realtime';
import { isDealEvent, type RealtimeEvent } from '@/lib/realtime';

/**
 * Live flash-deal strip. Seeds each countdown from the server's
 * secondsRemaining and ticks it down client-side. In a later iteration this
 * subscribes to the WS gateway (lc.events.deals) for push claim/sold-out
 * updates; today it renders the live feed with local countdowns.
 */
function countdown(seconds: number): string {
  if (seconds <= 0) return 'Ended';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}h ${m}m ${String(s).padStart(2, '0')}s`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function DealStrip({ deals }: { deals: FlashDealView[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /**
   * Remaining stock, overlaid on the server's numbers as claims land. Keyed by
   * deal id rather than replacing the list: the server render stays the source
   * of truth for which deals exist and what they cost — this only tracks the
   * one field that moves while someone is looking at the page.
   */
  const [claimed, setClaimed] = useState<Record<string, number>>({});

  const status = useRealtime(
    { all: true },
    useCallback((event: RealtimeEvent) => {
      if (!isDealEvent(event)) return;
      setClaimed((prev) =>
        prev[event.dealId] === event.quantityRemaining
          ? prev
          : { ...prev, [event.dealId]: event.quantityRemaining },
      );
    }, []),
  );

  if (deals.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex h-2 w-2 rounded-full ${
            status === 'live'
              ? 'animate-pulse bg-brass-400'
              : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
        />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brass-500 dark:text-brass-400">
          Flash deals{status === 'live' ? ' · live' : ''}
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {deals.map((d) => {
          const endMs = new Date(d.endsAt).getTime();
          const secondsLeft = Math.max(0, Math.round((endMs - now) / 1000));
          const rate = d.baseHourlyRateMinor ?? d.baseNightlyRateMinor;
          const netRate =
            rate != null ? Math.round(rate * (1 - d.discountPct / 100)) : null;
          // A live claim count supersedes the one this page was rendered with.
          const remaining = claimed[d.id] ?? d.quantityRemaining;
          const soldOut = remaining <= 0;
          return (
            <div
              key={d.id}
              className="min-w-[240px] shrink-0 rounded-2xl border border-brass-400/30 bg-gradient-to-b from-brass-400/[0.08] to-transparent p-4 dark:border-brass-500/25"
            >
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold">{d.propertyName}</p>
                <span className="rounded-full bg-brass-400 px-2 py-0.5 text-[11px] font-bold text-ink-950">
                  −{d.discountPct}%
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {d.unitName} · {d.city}
              </p>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  {netRate != null && rate != null ? (
                    <p className="tnum">
                      <span className="text-base font-semibold text-brass-500 dark:text-brass-300">
                        {money(netRate, d.currency)}
                      </span>
                      <span className="ml-1.5 text-xs text-zinc-400 line-through">
                        {money(rate, d.currency)}
                      </span>
                    </p>
                  ) : null}
                  <p
                    className={`mt-0.5 text-[11px] ${
                      soldOut
                        ? 'font-medium text-rose-500'
                        : 'text-zinc-500'
                    }`}
                  >
                    {soldOut
                      ? 'Sold out'
                      : `${remaining} of ${d.quantityTotal} left`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-sm font-semibold text-rose-500">
                    {countdown(secondsLeft)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-400">
                    remaining
                  </p>
                </div>
              </div>
              {secondsLeft > 0 && !soldOut && (
                <Link
                  href={`/deals/${d.id}/claim`}
                  className="mt-3 block rounded-lg bg-brass-500 px-3 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-brass-600 dark:bg-brass-600 dark:hover:bg-brass-500"
                >
                  Claim deal
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
