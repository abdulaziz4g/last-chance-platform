'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiPostSafe } from '@/lib/api';
import { isInstant } from '@/lib/local-time';
import type { Booking } from '@/lib/api';

export async function claimDealAction(
  _prev: { error?: string; retryAfterSec?: number; throttleId?: string } | null,
  formData: FormData,
): Promise<{ error?: string; retryAfterSec?: number; throttleId?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Please sign in first.' };

  const dealId = formData.get('dealId') as string;
  const bookingType = formData.get('bookingType') as 'HOURLY' | 'NIGHTLY';
  const checkInUtc = formData.get('checkInUtc') as string;
  const checkOutUtc = formData.get('checkOutUtc') as string;
  const guestsCount = Number(formData.get('guestsCount'));

  // Converted in the browser; see holdAction for why re-parsing here is a bug.
  if (!isInstant(checkInUtc) || !isInstant(checkOutUtc)) {
    return { error: 'Please pick a check-in and check-out time.' };
  }

  const result = await apiPostSafe<Booking>(`/deals/${dealId}/claim`, {
    guestId: session.sub,
    bookingType,
    checkInUtc,
    checkOutUtc,
    guestsCount,
  });

  if (!result.ok) {
    return {
      error: result.error,
      retryAfterSec: result.retryAfterSec,
      throttleId: result.throttleId,
    };
  }

  redirect(`/book/${result.data.unitId}/pay?bookingId=${result.data.id}`);
}
