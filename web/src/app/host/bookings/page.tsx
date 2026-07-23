import { DataTable, Mono, SectionTitle, StatusChip } from '@/components/ui';
import { getHostOverview } from '@/lib/api';
import { dateTime, money, timeWindow } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function HostBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ hostId?: string }>;
}) {
  const { hostId } = await searchParams;
  const host = await getHostOverview(hostId);
  if (!host) return <p className="text-zinc-500">No host profile found.</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Bookings</h1>
      <SectionTitle>All recent bookings for {host.displayName}</SectionTitle>
      <DataTable
        head={['Code', 'Guest', 'Property / unit', 'Type', 'Window', 'Total', 'Status']}
        rows={host.bookings.map((b) => [
          <Mono key="c">{b.bookingCode}</Mono>,
          b.guestName,
          `${b.propertyName} · ${b.unitName}`,
          <span key="y" className="text-xs uppercase tracking-wide text-zinc-500">
            {b.bookingType}
          </span>,
          <span key="w" className="text-xs text-zinc-500 dark:text-zinc-400">
            {timeWindow(b.checkInUtc, b.checkOutUtc)}
          </span>,
          <span key="t" className="tnum font-medium">
            {money(b.totalAmountMinor, b.currency)}
          </span>,
          <StatusChip key="s" status={b.status} />,
        ])}
      />
      <p className="text-xs text-zinc-500">
        Created timestamps and cancellation controls arrive with host actions in
        a later phase. Last refresh: {dateTime(new Date().toISOString())} UTC.
      </p>
    </div>
  );
}
