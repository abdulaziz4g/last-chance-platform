'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiPostSafe } from '@/lib/api';
import type { Booking, InitiatePaymentResult } from '@/lib/api';

export async function holdAction(
  _prev: { error?: string; booking?: unknown } | null,
  formData: FormData,
): Promise<{ error?: string; booking?: Booking }> {
  const session = await getSession();
  if (!session) return { error: 'Please sign in first.' };

  const unitId = formData.get('unitId') as string;
  const bookingType = formData.get('bookingType') as 'HOURLY' | 'NIGHTLY';
  const checkInUtc = formData.get('checkInUtc') as string;
  const checkOutUtc = formData.get('checkOutUtc') as string;
  const guestsCount = Number(formData.get('guestsCount'));

  const result = await apiPostSafe<Booking>('/bookings/hold', {
    guestId: session.sub,
    unitId,
    bookingType,
    checkInUtc: new Date(checkInUtc).toISOString(),
    checkOutUtc: new Date(checkOutUtc).toISOString(),
    guestsCount,
  });

  if (!result.ok) return { error: result.error };

  redirect(`/book/${unitId}/pay?bookingId=${result.data.id}`);
}

export async function payAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const bookingId = formData.get('bookingId') as string;
  const method = formData.get('method') as string;

  const result = await apiPostSafe<InitiatePaymentResult>('/payments/initiate', {
    bookingId,
    provider: 'MOCK',
    method,
  });

  if (!result.ok) return { error: result.error };

  const clientAction = result.data.clientAction;
  const paymentId = result.data.payment.id;

  if (clientAction?.type === 'MOCK_CONFIRM') {
    const capture = await apiPostSafe<{ accepted: boolean }>(
      `/payments/${paymentId}/simulate-capture`,
      {},
    );
    if (!capture.ok) return { error: capture.error };
  }

  redirect(`/book/confirmation?bookingId=${bookingId}`);
}
