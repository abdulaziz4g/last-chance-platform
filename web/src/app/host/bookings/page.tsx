import { Suspense } from 'react';
import { DataTable, Mono, SectionTitle, StatusChip } from '@/components/ui';
import {
  getHostBookings,
  getHostOverview,
  REPORT_PAGE_SIZE,
} from '@/lib/api';
import { money, timeWindow } from '@/lib/format';
import { HostBookingActions } from './booking-actions';
import { ActionFlash } from '@/components/action-flash';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-dynamic';

export default async function HostBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  // The overview is only consulted for the host's name; the bookings come from
  // the paged endpoint, so this page is no longer limited to whatever slice
  // the overview happened to embed.
  const [host, bookings] = await Promise.all([
    getHostOverview(),
    getHostBookings(page),
  ]);
  if (!host) return <p className="text-zinc-500">No host profile found.</p>;

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ActionFlash />
      </Suspense>

      <h1 className="text-xl font-semibold">Bookings</h1>
      <SectionTitle>All recent bookings for {host.displayName}</SectionTitle>
      <DataTable
        head={[
          'Code',
          'Guest',
          'Property / unit',
          'Type',
          'Window',
          'Total',
          'Status',
          'Actions',
        ]}
        rows={bookings.items.map((b) => [
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
          <HostBookingActions
            key="a"
            bookingId={b.id}
            status={b.status}
            page={page}
          />,
        ])}
      />
      <Pagination
        basePath="/host/bookings"
        params={sp}
        page={page}
        pageSize={REPORT_PAGE_SIZE}
        total={bookings.total}
      />
    </div>
  );
}
