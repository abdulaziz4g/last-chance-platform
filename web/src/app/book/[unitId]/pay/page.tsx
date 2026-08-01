import { getBooking, getPaymentConfig } from '@/lib/api';
import { money } from '@/lib/format';
import { LocalTimeWindow } from '@/components/local-time';
import { GuestHeader } from '@/components/guest-header';
import { Card, StatusChip } from '@/components/ui';
import { PayForm } from './pay-form';

export const dynamic = 'force-dynamic';

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { unitId } = await params;
  const sp = await searchParams;
  const bookingId = sp.bookingId;

  if (!bookingId) {
    return (
      <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
        <Card className="px-6 py-10 text-center text-taupe-500">
          Missing booking ID. Please start from the booking page.
        </Card>
      </main>
    );
  }

  let booking;
  try {
    booking = await getBooking(bookingId);
  } catch {
    return (
      <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
        <Card className="px-6 py-10 text-center text-taupe-500">
          Booking not found or expired.
        </Card>
      </main>
    );
  }

  // Which PSP drives checkout is a server decision — the client is told, not
  // asked, so a tampered form cannot select a provider that is not enabled.
  const paymentConfig = await getPaymentConfig();

  return (
    <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
      {/* No competing links here on purpose — mid-checkout the only extra
          control is the way out of the session. */}
      <GuestHeader area="Complete payment" />

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-xs text-taupe-500 dark:text-zinc-400">
            {booking.bookingCode}
          </p>
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

          <div className="flex justify-between text-xs text-taupe-500">
            <span>Base</span>
            <span className="tnum">{money(booking.baseAmountMinor, booking.currency)}</span>
          </div>
          {booking.cleaningFeeMinor > 0 && (
            <div className="flex justify-between text-xs text-taupe-500">
              <span>Cleaning</span>
              <span className="tnum">{money(booking.cleaningFeeMinor, booking.currency)}</span>
            </div>
          )}
          {booking.serviceFeeMinor > 0 && (
            <div className="flex justify-between text-xs text-taupe-500">
              <span>Service fee</span>
              <span className="tnum">{money(booking.serviceFeeMinor, booking.currency)}</span>
            </div>
          )}
          {booking.taxesMinor > 0 && (
            <div className="flex justify-between text-xs text-taupe-500">
              <span>Taxes</span>
              <span className="tnum">{money(booking.taxesMinor, booking.currency)}</span>
            </div>
          )}
          {booking.discountMinor > 0 && (
            <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400">
              <span>Discount</span>
              <span className="tnum">-{money(booking.discountMinor, booking.currency)}</span>
            </div>
          )}

          <div className="my-3 border-t border-zinc-100 dark:border-white/[0.06]" />

          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tnum text-coral-500 dark:text-coral-300">
              {money(booking.totalAmountMinor, booking.currency)}
            </span>
          </div>
        </div>
      </Card>

      {booking.holdExpiresAt && (
        <p className="mb-4 text-center text-xs text-amber-600 dark:text-amber-400">
          Hold expires at {new Date(booking.holdExpiresAt).toLocaleTimeString()} — complete payment before then.
        </p>
      )}

      <PayForm
        bookingId={bookingId}
        unitId={unitId}
        provider={paymentConfig.provider}
        publishableKey={paymentConfig.publishableKey}
        currency={booking.currency}
      />
    </main>
  );
}
