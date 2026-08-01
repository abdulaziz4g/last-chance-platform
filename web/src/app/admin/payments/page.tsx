import { DataTable, Mono, SectionTitle, StatusChip } from '@/components/ui';
import {
  getAdminPayments,
  getAdminPayouts,
  getAdminWebhooks,
  REPORT_PAGE_SIZE,
} from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  // Each table pages independently, so each owns its own query key —
  // otherwise stepping through payouts would silently reset payments.
  const pageOf = (key: string) => Math.max(1, Number(sp[key]) || 1);

  const [payments, payouts, webhooks] = await Promise.all([
    getAdminPayments(pageOf('payments')),
    getAdminPayouts(pageOf('payouts')),
    getAdminWebhooks(pageOf('webhooks')),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold">Payments, payouts & webhooks</h1>
        <p className="mt-1 text-sm text-taupe-500 dark:text-zinc-400">
          The money pipeline end to end — capture, split, transfer, refund.
        </p>
      </header>

      <section>
        <SectionTitle>Payments</SectionTitle>
        <DataTable
          head={['Booking', 'Provider', 'Method', 'Amount', 'Refunded', 'Status', 'Captured']}
          rows={payments.items.map((p) => [
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
            <span key="c" className="text-xs text-taupe-500">
              {dateTime(p.capturedAt)}
            </span>,
          ])}
        />
        <Pagination
          basePath="/admin/payments"
          params={sp}
          paramName="payments"
          label="Payments"
          page={pageOf('payments')}
          pageSize={REPORT_PAGE_SIZE}
          total={payments.total}
        />
      </section>

      <section>
        <SectionTitle>Payouts</SectionTitle>
        <DataTable
          head={['Booking', 'Host', 'Amount', 'Provider ref', 'Status', 'Paid at']}
          rows={payouts.items.map((p) => [
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
            <span key="t" className="text-xs text-taupe-500">
              {dateTime(p.paidAt)}
            </span>,
          ])}
        />
        <Pagination
          basePath="/admin/payments"
          params={sp}
          paramName="payouts"
          label="Payouts"
          page={pageOf('payouts')}
          pageSize={REPORT_PAGE_SIZE}
          total={payouts.total}
        />
      </section>

      <section>
        <SectionTitle>Webhook events</SectionTitle>
        <DataTable
          head={['Provider', 'Event', 'Type', 'Signature', 'Attempts', 'Status', 'Received']}
          rows={webhooks.items.map((w) => [
            w.provider,
            <Mono key="e">{w.eventId}</Mono>,
            <span key="y" className="text-xs">{w.eventType}</span>,
            <StatusChip key="v" status={w.signatureValid ? 'VALID' : 'INVALID'} />,
            <span key="a" className="tnum">{String(w.attempts)}</span>,
            <StatusChip key="s" status={w.status} />,
            <span key="t" className="text-xs text-taupe-500">
              {dateTime(w.receivedAt)}
            </span>,
          ])}
        />
        <Pagination
          basePath="/admin/payments"
          params={sp}
          paramName="webhooks"
          label="Webhook events"
          page={pageOf('webhooks')}
          pageSize={REPORT_PAGE_SIZE}
          total={webhooks.total}
        />
      </section>
    </div>
  );
}
