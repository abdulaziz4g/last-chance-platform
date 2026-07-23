import {
  DataTable,
  Mono,
  SectionTitle,
  StatCard,
  StatusChip,
} from '@/components/ui';
import { getAdminBookings, getAdminOverview } from '@/lib/api';
import { dateTime, money, timeWindow } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const [overview, bookings] = await Promise.all([
    getAdminOverview(),
    getAdminBookings(30),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold">Operations overview</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Live platform state — refreshed on every load.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Active payment holds"
          value={String(overview.activeHolds)}
          hint="PENDING_PAYMENT, blocking inventory"
        />
        <StatCard
          label="Upcoming stays"
          value={String(overview.confirmedUpcoming)}
          hint="Confirmed or checked in"
        />
        <StatCard
          label="Bookings · 24h"
          value={String(overview.bookings24h)}
        />
        <StatCard
          label="Captured · 24h"
          value={money(overview.captured24hMinor, 'SAR')}
          accent
        />
        <StatCard
          label="Payouts settled"
          value={money(overview.payoutsPaidMinor, 'SAR')}
          hint="All-time, PAID"
        />
        <StatCard
          label="Failed webhooks"
          value={String(overview.failedWebhooks)}
          hint={overview.failedWebhooks > 0 ? 'Needs attention' : 'All clear'}
        />
      </section>

      <section>
        <SectionTitle>Recent bookings</SectionTitle>
        <DataTable
          head={['Code', 'Guest', 'Property / unit', 'Window', 'Total', 'Status', 'Created']}
          rows={bookings.map((b) => [
            <Mono key="c">{b.bookingCode}</Mono>,
            b.guestName,
            `${b.propertyName} · ${b.unitName}`,
            <span key="w" className="text-xs text-zinc-500 dark:text-zinc-400">
              {timeWindow(b.checkInUtc, b.checkOutUtc)}
            </span>,
            <span key="t" className="tnum font-medium">
              {money(b.totalAmountMinor, b.currency)}
            </span>,
            <StatusChip key="s" status={b.status} />,
            <span key="d" className="text-xs text-zinc-500">
              {dateTime(b.createdAt)}
            </span>,
          ])}
        />
      </section>
    </div>
  );
}
