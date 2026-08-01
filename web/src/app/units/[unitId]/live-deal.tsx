'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRealtime } from '@/components/use-realtime';
import { isDealEvent, type RealtimeEvent } from '@/lib/realtime';
import { DealCountdown } from './deal-countdown';

/**
 * The deal banner, kept current while the reader decides.
 *
 * This page is exactly where a stale count costs something: someone reads the
 * description, weighs it up, and clicks Claim on a deal that sold out two
 * minutes ago — landing on an error instead of a booking. Subscribed to this
 * unit only, since that is all this page shows.
 */
export function LiveDeal({
  unitId,
  dealId,
  title,
  discountPct,
  endsAt,
  quantityRemaining,
}: {
  unitId: string;
  dealId: string;
  title: string;
  discountPct: number;
  endsAt: string;
  quantityRemaining: number;
}) {
  const [remaining, setRemaining] = useState(quantityRemaining);

  useRealtime(
    { unitId },
    useCallback(
      (event: RealtimeEvent) => {
        if (!isDealEvent(event) || event.dealId !== dealId) return;
        setRemaining(event.quantityRemaining);
      },
      [dealId],
    ),
  );

  const soldOut = remaining <= 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              soldOut ? 'bg-zinc-400' : 'animate-pulse bg-coral-400'
            }`}
          />
          <p className="text-sm font-semibold">{title}</p>
          <span className="rounded-full bg-coral-400 px-2 py-0.5 text-[11px] font-bold text-ink-950">
            −{discountPct}%
          </span>
        </div>
        <p className="mt-1 text-xs text-taupe-500 dark:text-zinc-400">
          {soldOut ? (
            <span className="font-medium text-rose-500">Sold out</span>
          ) : (
            <>
              {remaining} left · <DealCountdown endsAt={endsAt} />
            </>
          )}
        </p>
      </div>

      {soldOut ? (
        <span className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-400 dark:border-white/[0.08] dark:text-zinc-600">
          Claimed
        </span>
      ) : (
        <Link
          href={`/deals/${dealId}/claim`}
          className="rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 dark:bg-coral-600 dark:hover:bg-coral-500"
        >
          Claim deal
        </Link>
      )}
    </div>
  );
}
