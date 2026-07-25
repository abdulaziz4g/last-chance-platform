import Link from 'next/link';
import { getGuestBookings } from '@/lib/api';
import { money, timeWindow } from '@/lib/format';
import { Card, StatusChip, Mono, SectionTitle } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MyBookingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  let bookings: Awaited<ReturnType<typeof getGuestBookings>>;
  try {
    bookings = await getGuestBookings(50);
  } catch {
    bookings = [];
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-[13px] font-semibold tracking-[0.32em]">
            LAST&nbsp;CHANCE
          </Link>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-brass-500 dark:text-brass-400">
            My bookings
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/discover"
            className="text-sm text-brass-500 transition-colors hover:text-brass-600 dark:text-brass-400 dark:hover:text-brass-300"
          >
            Discover →
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <SectionTitle>
        {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
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
                    {timeWindow(b.checkInUtc, b.checkOutUtc)}
                  </p>
                </div>
                <p className="tnum font-semibold text-brass-500 dark:text-brass-300">
                  {money(b.totalAmountMinor, b.currency)}
                </p>
              </div>

              {b.status === 'PENDING_PAYMENT' && (
                <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-white/[0.06]">
                  <Link
                    href={`/book/${b.unitId}/pay?bookingId=${b.id}`}
                    className="text-xs font-medium text-brass-500 hover:text-brass-600 dark:text-brass-400"
                  >
                    Complete payment →
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
