import { DataTable, Mono, SectionTitle, StatusChip } from '@/components/ui';
import { getAdminLedger, getAdminPayouts } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { AdjustmentForm, PayoutControls } from './escrow-controls';

export const dynamic = 'force-dynamic';

/** Payouts an operator can still act on. Settled ones are nobody's problem. */
const ACTIONABLE = new Set(['PENDING', 'SCHEDULED', 'ON_HOLD', 'FAILED']);

export default async function EscrowPage() {
  const [ledger, payouts] = await Promise.all([
    getAdminLedger(1),
    getAdminPayouts(1),
  ]);

  const actionable = payouts.items.filter((p) => ACTIONABLE.has(p.status));

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold">Escrow override & payouts</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manual intervention in the money pipeline. Everything here is
          additive — corrections are posted as new entries, never edits.
        </p>
      </header>

      <section>
        <SectionTitle>Account balances</SectionTitle>
        <DataTable
          head={['Account', 'Currency', 'Balance', 'Entries']}
          rows={ledger.balances.map((b) => [
            <Mono key="a">{b.account}</Mono>,
            b.currency,
            <span key="b" className="tnum font-medium">
              {money(b.balanceMinor, b.currency)}
            </span>,
            <span key="e" className="tnum text-xs text-zinc-500">
              {b.entries}
            </span>,
          ])}
        />
      </section>

      <section>
        <SectionTitle>Payouts needing attention ({actionable.length})</SectionTitle>
        {actionable.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Nothing held, pending or failed on this page.
          </p>
        ) : (
          <DataTable
            head={['Booking', 'Host', 'Amount', 'Status', 'Created', 'Action']}
            rows={actionable.map((p) => [
              <Mono key="b">{p.bookingCode}</Mono>,
              p.hostName,
              <span key="a" className="tnum font-medium">
                {money(p.amountMinor, p.currency)}
              </span>,
              <StatusChip key="s" status={p.status} />,
              <span key="c" className="text-xs text-zinc-500">
                {dateTime(p.createdAt)}
              </span>,
              <PayoutControls key="x" payoutId={p.id} status={p.status} />,
            ])}
          />
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Holding a payout writes no ledger entry: the split already credited
          host payable when the stay completed, and stopping the transfer does
          not change what is owed.
        </p>
      </section>

      <section className="max-w-2xl">
        <SectionTitle>Manual adjustment</SectionTitle>
        <AdjustmentForm />
      </section>
    </div>
  );
}
