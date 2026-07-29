import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BOOKINGS_PAGE_SIZE,
  canGuestCancel,
  getGuestBookings,
} from '@/lib/api';
import { Pagination } from '@/components/pagination';
import { CancelBooking } from './cancel-booking';
import { ActionFlash } from '@/components/action-flash';
import { logoutAction } from '@/app/login/actions';
import { money } from '@/lib/format';
import { LocalTimeWindow } from '@/components/local-time';
import { Card, StatusChip, Mono, SectionTitle } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My bookings',
  // Someone's reservations are not for the index, whatever robots.txt says.
  robots: { index: false, follow: false },
};

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const sp = await searchParams;
  const requested = Number(sp.page);
  const page =
    Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;

  // Deliberately unguarded: an empty list and an unreachable API look identical
  // to the reader, and "No bookings yet" is a lie to someone holding a
  // reservation. Let bookings/error.tsx say what actually happened.
  const { items: bookings, total } = await getGuestBookings(
    BOOKINGS_PAGE_SIZE,
    (page - 1) * BOOKINGS_PAGE_SIZE,
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={null}>
        <ActionFlash />
      </Suspense>

      <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <Link href="/" className="text-[13px] font-semibold tracking-[0.32em]">
            LAST&nbsp;CHANCE
          </Link>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-brass-500 dark:text-brass-400">
            My bookings
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="/discover"
            className="text-sm whitespace-nowrap text-brass-500 transition-colors hover:text-brass-600 dark:text-brass-400 dark:hover:text-brass-300"
          >
            Discover →
          </Link>
          {/* The only sign-out a guest has: the host and admin shells carry
              their own, but guests never see those. */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm whitespace-nowrap text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Sign out
            </button>
          </form>
          <ThemeToggle />
        </div>
      </header>

      <SectionTitle>
        {total} {total === 1 ? 'booking' : 'bookings'}
      </SectionTitle>

      {bookings.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No bookings yet.</p>
          <Link
            href="/discover"
            className="mt-3 inline-block text-sm text-brass-500 hover:text-brass-600 dark:text-brass-400"
          >
            Browse stays →
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Mono>{b.bookingCode}</Mono>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {b.bookingType} · {b.guestsCount} {b.guestsCount === 1 ? 'guest' : 'guests'}
                  </p>
                </div>
                <StatusChip status={b.status} />
              </div>

              <div className="mt-3 flex items-end justify-between text-sm">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    <LocalTimeWindow fromIso={b.checkInUtc} toIso={b.checkOutUtc} />
                  </p>
                </div>
                <p className="tnum font-semibold text-brass-500 dark:text-brass-300">
                  {money(b.totalAmountMinor, b.currency)}
                </p>
              </div>

              {(b.status === 'PENDING_PAYMENT' || canGuestCancel(b.status)) && (
                <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3 dark:border-white/[0.06]">
                  {b.status === 'PENDING_PAYMENT' && (
                    <Link
                      href={`/book/${b.unitId}/pay?bookingId=${b.id}`}
                      className="block text-xs font-medium text-brass-500 hover:text-brass-600 dark:text-brass-400"
                    >
                      Complete payment →
                    </Link>
                  )}
                  {canGuestCancel(b.status) && (
                    <CancelBooking
                      bookingId={b.id}
                      bookingCode={b.bookingCode}
                      status={b.status}
                      page={page}
                    />
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Pagination
        basePath="/bookings"
        params={sp}
        page={page}
        pageSize={BOOKINGS_PAGE_SIZE}
        total={total}
      />
    </div>
  );
}
