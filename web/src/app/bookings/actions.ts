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
  // Which page the reader was on. Stripping the flash keys from the URL is not
  // enough on its own — the redirect has to carry the page back, or cancelling
  // from page two silently returns them to page one.
  const page = Number(formData.get('page')) || 1;

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
  const query = new URLSearchParams({
    done: 'cancelled',
    code: result.data.bookingCode,
  });
  if (page > 1) query.set('page', String(page));
  redirect(`/bookings?${query.toString()}`);
}
