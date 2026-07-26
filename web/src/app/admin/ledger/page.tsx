import { Card, DataTable, Mono, SectionTitle, StatusChip } from '@/components/ui';
import { getAdminLedger, REPORT_PAGE_SIZE } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-dynamic';

const ACCOUNT_LABELS: Record<string, string> = {
  PROVIDER_CLEARING: 'Provider clearing',
  PLATFORM_ESCROW: 'Platform escrow',
  PLATFORM_REVENUE: 'Platform revenue',
  HOST_PAYABLE: 'Host payable',
  TAX_PAYABLE: 'Tax payable',
  GUEST_REFUND_CLEARING: 'Guest refund clearing',
};

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  // Balances summarise the whole ledger, so they stay whole while the entries
  // beneath them page — a running total that changed per page would be a lie.
  const { balances, entries, total } = await getAdminLedger(page);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold">Escrow ledger</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Double-entry, append-only. Every group balances — enforced at COMMIT
          by the database.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {balances.map((b) => (
          <Card key={`${b.account}-${b.currency}`} className="px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              {ACCOUNT_LABELS[b.account] ?? b.account}
            </p>
            <p className="tnum mt-1.5 text-xl font-semibold">
              {money(b.balanceMinor, b.currency)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {b.entries} {b.entries === 1 ? 'entry' : 'entries'} · credit-positive
            </p>
          </Card>
        ))}
        {balances.length === 0 ? (
          <p className="col-span-full text-zinc-500">No ledger activity yet.</p>
        ) : null}
      </section>

      <section>
        <SectionTitle>Recent entries</SectionTitle>
        <DataTable
          head={['#', 'Account', 'Direction', 'Amount', 'Booking', 'Description', 'At']}
          rows={entries.map((e) => [
            <Mono key="i">{String(e.id)}</Mono>,
            ACCOUNT_LABELS[e.account] ?? e.account,
            <StatusChip key="d" status={e.direction} />,
            <span key="a" className="tnum font-medium">
              {e.direction === 'DEBIT' ? '−' : '+'}
              {money(e.amountMinor, e.currency)}
            </span>,
            e.bookingCode ? <Mono key="b">{e.bookingCode}</Mono> : '—',
            <span key="x" className="text-xs text-zinc-500 dark:text-zinc-400">
              {e.description}
            </span>,
            <span key="t" className="text-xs text-zinc-500">
              {dateTime(e.createdAt)}
            </span>,
          ])}
        />
        <Pagination
          basePath="/admin/ledger"
          params={sp}
          page={page}
          pageSize={REPORT_PAGE_SIZE}
          total={total}
        />
      </section>
    </div>
  );
}
