'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiPostSafe } from '@/lib/api';
import type { Booking } from '@/lib/api';

export async function claimDealAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Please sign in first.' };

  const dealId = formData.get('dealId') as string;
  const bookingType = formData.get('bookingType') as 'HOURLY' | 'NIGHTLY';
  const checkInUtc = formData.get('checkInUtc') as string;
  const checkOutUtc = formData.get('checkOutUtc') as string;
  const guestsCount = Number(formData.get('guestsCount'));

  const result = await apiPostSafe<Booking>(`/deals/${dealId}/claim`, {
    guestId: session.sub,
    bookingType,
    checkInUtc: new Date(checkInUtc).toISOString(),
    checkOutUtc: new Date(checkOutUtc).toISOString(),
    guestsCount,
  });

  if (!result.ok) return { error: result.error };

  redirect(`/book/${result.data.unitId}/pay?bookingId=${result.data.id}`);
}
