import Link from 'next/link';
import { getBooking } from '@/lib/api';
import { money } from '@/lib/format';
import { LocalTimeWindow } from '@/components/local-time';
import { GuestHeader } from '@/components/guest-header';
import { Card, StatusChip, Mono } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const bookingId = sp.bookingId;

  if (!bookingId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-taupe-500">Missing booking reference.</p>
      </main>
    );
  }

  let booking;
  try {
    booking = await getBooking(bookingId);
  } catch {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-taupe-500">Booking not found.</p>
      </main>
    );
  }

  const isConfirmed = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN' || booking.status === 'COMPLETED';

  return (
    <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
      <GuestHeader area="Confirmation">
        <Link
          href="/bookings"
          className="text-sm whitespace-nowrap text-taupe-500 transition-colors hover:text-coral-500 dark:text-zinc-400 dark:hover:text-coral-400"
        >
          My bookings
        </Link>
      </GuestHeader>

      <div className="mb-8 text-center">
        <p className="text-4xl">{isConfirmed ? '✓' : '⏳'}</p>
        <h1 className="mt-3 text-xl font-semibold">
          {isConfirmed ? 'Booking confirmed' : 'Payment processing'}
        </h1>
        <p className="mt-1 text-sm text-taupe-500 dark:text-zinc-400">
          {isConfirmed
            ? 'Your stay is secured. See you there!'
            : 'Your payment is being processed. The booking will confirm shortly.'}
        </p>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <Mono>{booking.bookingCode}</Mono>
          <StatusChip status={booking.status} />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-taupe-500 dark:text-zinc-400">Type</span>
            <span>{booking.bookingType}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="shrink-0 text-taupe-500 dark:text-zinc-400">
              Window
            </span>
            <span className="text-right text-xs">
              <LocalTimeWindow
                fromIso={booking.checkInUtc}
                toIso={booking.checkOutUtc}
              />
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-taupe-500 dark:text-zinc-400">Guests</span>
            <span>{booking.guestsCount}</span>
          </div>
          <div className="my-3 border-t border-zinc-100 dark:border-white/[0.06]" />
          <div className="flex justify-between font-semibold">
            <span>Total paid</span>
            <span className="tnum text-coral-500 dark:text-coral-300">
              {money(booking.totalAmountMinor, booking.currency)}
            </span>
          </div>
        </div>
      </Card>

      <div className="mt-8 flex justify-center gap-4">
        <Link
          href="/bookings"
          className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium transition-colors hover:border-coral-400 dark:border-white/[0.08] dark:hover:border-coral-500"
        >
          My bookings
        </Link>
        <Link
          href="/discover"
          className="rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600 dark:bg-coral-600 dark:hover:bg-coral-500"
        >
          Browse more
        </Link>
      </div>
    </main>
  );
}
