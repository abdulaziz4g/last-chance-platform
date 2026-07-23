import {
  DataTable,
  Mono,
  SectionTitle,
  StatCard,
  StatusChip,
} from '@/components/ui';
import { getHostOverview } from '@/lib/api';
import { dateTime, money, timeWindow } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function HostOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ hostId?: string }>;
}) {
  const { hostId } = await searchParams;
  const host = await getHostOverview(hostId);

  if (!host) {
    return (
      <p className="text-zinc-500">
        No host profile exists yet — create one via the API to see this studio.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold">{host.displayName}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {host.ratingAvg
            ? `★ ${host.ratingAvg} · ${host.ratingCount} reviews`
            : 'No reviews yet'}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Earnings settled"
          value={money(host.earningsPaidMinor, 'SAR')}
          hint="Paid out to your account"
          accent
        />
        <StatCard
          label="Earnings pending"
          value={money(host.earningsPendingMinor, 'SAR')}
          hint="In escrow or in transit"
        />
        <StatCard
          label="Upcoming stays"
          value={String(host.upcomingStays)}
          hint="Confirmed or checked in"
        />
      </section>

      <section>
        <SectionTitle>Your units</SectionTitle>
        <DataTable
          head={['Unit', 'Property', 'Hourly', 'Nightly', 'Status']}
          rows={host.units.map((u) => [
            <span key="n" className="font-medium">
              {u.name}
            </span>,
            u.propertyName,
            <span key="h" className="tnum">
              {u.supportsHourly && u.hourlyRateMinor != null
                ? money(u.hourlyRateMinor, u.currency)
                : '—'}
            </span>,
            <span key="d" className="tnum">
              {u.supportsNightly && u.nightlyRateMinor != null
                ? money(u.nightlyRateMinor, u.currency)
                : '—'}
            </span>,
            <StatusChip key="s" status={u.status} />,
          ])}
          empty="No units yet — list your first space"
        />
      </section>

      <section>
        <SectionTitle>Recent bookings</SectionTitle>
        <DataTable
          head={['Code', 'Guest', 'Unit', 'Window', 'Total', 'Status', 'Created']}
          rows={host.bookings.map((b) => [
            <Mono key="c">{b.bookingCode}</Mono>,
            b.guestName,
            b.unitName,
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
