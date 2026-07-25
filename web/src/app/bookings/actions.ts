'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiPostSafe } from '@/lib/api';
import type { Booking } from '@/lib/api';

/** Returns only on failure; success redirects with a flash param. */
export async function cancelBookingAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const bookingId = formData.get('bookingId') as string;
  const reason = ((formData.get('reason') as string) ?? '').trim();

  if (!bookingId) return { error: 'Missing booking reference.' };

  // `cancelledBy` is deliberately absent: the server derives the acting party
  // from the session, so a client cannot claim to be someone else.
  const result = await apiPostSafe<Booking>(`/bookings/${bookingId}/cancel`, {
    reason: reason || null,
  });

  if (!result.ok) return { error: result.error };

  // The confirmation cannot be announced by the form that submitted it: once
  // the list revalidates, a cancelled booking no longer renders a cancel
  // control, so that component unmounts before its effect could fire. Hand the
  // message to the page via the URL instead, where something stable owns it.
  revalidatePath('/bookings');
  redirect(
    `/bookings?done=cancelled&code=${encodeURIComponent(result.data.bookingCode)}`,
  );
}
