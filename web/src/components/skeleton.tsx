import { Card } from './ui';

/**
 * Loading placeholders — same geometry as the real thing, so the page does not
 * reflow when data lands. Shimmer rather than pulse: it reads as "working"
 * instead of "broken".
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`lc-shimmer rounded-md ${className}`} />;
}

/** A single stat tile — label line over a value line. */
export function SkeletonStat() {
  return (
    <Card className="px-5 py-4">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="mt-3 h-6 w-28" />
    </Card>
  );
}

export function SkeletonStatRow({
  count = 6,
  className = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}

/** Mirrors DataTable: header rule, then evenly spaced rows. */
export function SkeletonTable({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 border-b border-zinc-200 px-4 py-3 dark:border-white/[0.06]">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex gap-4 border-b border-zinc-100 px-4 py-3.5 last:border-0 dark:border-white/[0.04]"
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </Card>
  );
}

/** Mirrors the discover unit card. */
export function SkeletonUnitCard() {
  return (
    <Card className="flex flex-col overflow-hidden">
      <Skeleton className="aspect-[3/2] w-full rounded-none" />
      <div className="p-5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="mt-2 h-2.5 w-40" />
        <div className="mt-3 flex gap-1.5">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="mt-4 h-6 w-28" />
        <Skeleton className="mt-1.5 h-2.5 w-24" />
        <Skeleton className="mt-4 h-9 w-full rounded-lg" />
      </div>
    </Card>
  );
}

export function SkeletonUnitGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonUnitCard key={i} />
      ))}
    </div>
  );
}

/** Mirrors a booking summary card on /bookings. */
export function SkeletonBookingCard() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-2 h-2.5 w-28" />
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <Skeleton className="h-2.5 w-52" />
        <Skeleton className="h-4 w-24" />
      </div>
    </Card>
  );
}

export function SkeletonBookingList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBookingCard key={i} />
      ))}
    </div>
  );
}

/** Uppercase tracked section heading. */
export function SkeletonSectionTitle() {
  return <Skeleton className="mb-3 h-3 w-40" />;
}
