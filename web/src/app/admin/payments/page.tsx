import { DataTable, Mono, SectionTitle, StatusChip } from '@/components/ui';
import { getAdminPayments, getAdminPayouts, getAdminWebhooks } from '@/lib/api';
import { dateTime, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const [payments, payouts, webhooks] = await Promise.all([
    getAdminPayments(30),
    getAdminPayouts(30),
    getAdminWebhooks(30),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold">Payments, payouts & webhooks</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The money pipeline end to end — capture, split, transfer, refund.
        </p>
      </header>

      <section>
        <SectionTitle>Payments</SectionTitle>
        <DataTable
          head={['Booking', 'Provider', 'Method', 'Amount', 'Refunded', 'Status', 'Captured']}
          rows={payments.map((p) => [
            <Mono key="b">{p.bookingCode}</Mono>,
            p.provider,
            p.method,
            <span key="a" className="tnum font-medium">
              {money(p.amountMinor, p.currency)}
            </span>,
            <span key="r" className="tnum">
              {p.refundedAmountMinor > 0
                ? money(p.refundedAmountMinor, p.currency)
                : '—'}
            </span>,
            <StatusChip key="s" status={p.status} />,
            <span key="c" className="text-xs text-zinc-500">
              {dateTime(p.capturedAt)}
            </span>,
          ])}
        />
      </section>

      <section>
        <SectionTitle>Payouts</SectionTitle>
        <DataTable
          head={['Booking', 'Host', 'Amount', 'Provider ref', 'Status', 'Paid at']}
          rows={payouts.map((p) => [
            <Mono key="b">{p.bookingCode}</Mono>,
            p.hostName,
            <span key="a" className="tnum font-medium">
              {money(p.amountMinor, p.currency)}
            </span>,
            p.providerTransferId ? (
              <Mono key="r">{p.providerTransferId}</Mono>
            ) : (
              '—'
            ),
            <StatusChip key="s" status={p.status} />,
            <span key="t" className="text-xs text-zinc-500">
              {dateTime(p.paidAt)}
            </span>,
          ])}
        />
      </section>

      <section>
        <SectionTitle>Webhook events</SectionTitle>
        <DataTable
          head={['Provider', 'Event', 'Type', 'Signature', 'Attempts', 'Status', 'Received']}
          rows={webhooks.map((w) => [
            w.provider,
            <Mono key="e">{w.eventId}</Mono>,
            <span key="y" className="text-xs">{w.eventType}</span>,
            <StatusChip key="v" status={w.signatureValid ? 'VALID' : 'INVALID'} />,
            <span key="a" className="tnum">{String(w.attempts)}</span>,
            <StatusChip key="s" status={w.status} />,
            <span key="t" className="text-xs text-zinc-500">
              {dateTime(w.receivedAt)}
            </span>,
          ])}
        />
      </section>
    </div>
  );
}
