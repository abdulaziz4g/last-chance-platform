import type { ReactNode } from 'react';

/** The shared visual vocabulary — hairline borders, generous air, one accent. */

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  // The package's card: white, radius 22, and ONE shadow — the same
  // `0 10 30 rgba(43,31,26,0.08)` mobile paints, now a token rather than an
  // arbitrary inline value. The grey hairline is gone in light mode because
  // the package separates surfaces with elevation, not stroke; dark mode keeps
  // a faint edge, where a warm shadow reads as nothing.
  return (
    <div
      className={`rounded-card bg-white shadow-card dark:border dark:border-white/[0.06] dark:bg-ink-900 dark:shadow-none ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-taupe-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`tnum mt-1.5 text-2xl font-semibold ${
          accent ? 'text-coral-500 dark:text-coral-300' : ''
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-taupe-500 dark:text-zinc-500">{hint}</p>
      ) : null}
    </Card>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-300">
        {children}
      </h2>
      {right}
    </div>
  );
}

export function DataTable({
  head,
  rows,
  empty = 'No records yet',
}: {
  head: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left dark:border-white/[0.06]">
            {head.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-taupe-500 dark:text-zinc-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={head.length}
                className="px-4 py-10 text-center text-taupe-500"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr
                key={i}
                className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-white/[0.04] dark:hover:bg-white/[0.02]"
              >
                {cells.map((c, j) => (
                  <td key={j} className="px-4 py-3 align-middle">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}

const CHIP_STYLES: Record<string, string> = {
  // bookings
  PENDING_PAYMENT: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  CONFIRMED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  CHECKED_IN: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20',
  COMPLETED: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 ring-zinc-500/20',
  CANCELLED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20',
  EXPIRED: 'bg-zinc-500/10 text-taupe-500 ring-zinc-500/20',
  REFUNDED: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  DRAFT: 'bg-zinc-500/10 text-taupe-500 ring-zinc-500/20',
  // payments / payouts / webhooks
  CAPTURED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  REQUIRES_ACTION: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  INITIATED: 'bg-zinc-500/10 text-taupe-500 ring-zinc-500/20',
  FAILED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20',
  PARTIALLY_REFUNDED: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  PAID: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  PENDING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  IN_TRANSIT: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20',
  PROCESSED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  RECEIVED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  SKIPPED: 'bg-zinc-500/10 text-taupe-500 ring-zinc-500/20',
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  // ledger directions
  CREDIT: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  DEBIT: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 ring-zinc-500/20',
  VALID: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  INVALID: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20',
};

export function StatusChip({ status }: { status: string }) {
  const style = CHIP_STYLES[status] ?? 'bg-zinc-500/10 text-taupe-500 ring-zinc-500/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ring-1 ring-inset ${style}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-xs text-taupe-500 dark:text-zinc-400">
      {children}
    </span>
  );
}
