'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiPostSafe } from '@/lib/api';
import type { Booking } from '@/lib/api';

type ActionState = { error?: string } | null;

/**
 * Both host views list bookings, so both are refreshed. The outcome is then
 * handed to the page through the URL: these actions change which controls a
 * row offers, so the button that submitted has been replaced by the time the
 * result lands and cannot announce it.
 */
function finish(
  path: string,
  key: string,
  bookingCode: string,
  page: number,
): never {
  revalidatePath('/host/bookings');
  revalidatePath('/host');
  const query = new URLSearchParams({ done: key, code: bookingCode });
  // Carry the page back, or acting on a row from page three drops the
  // operator at the top of page one.
  if (page > 1) query.set('page', String(page));
  redirect(`${path}?${query.toString()}`);
}

/** Page the control was rendered on, submitted alongside the booking. */
const pageOf = (formData: FormData): number =>
  Math.max(1, Number(formData.get('page')) || 1);

async function run(
  formData: FormData,
  endpoint: string,
  key: string,
): Promise<{ error?: string }> {
  const bookingId = formData.get('bookingId') as string;
  if (!bookingId) return { error: 'Missing booking reference.' };

  const result = await apiPostSafe<Booking>(
    `/bookings/${bookingId}/${endpoint}`,
    {},
  );
  if (!result.ok) return { error: result.error };

  finish('/host/bookings', key, result.data.bookingCode, pageOf(formData));
}

export async function checkInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  return run(formData, 'check-in', 'checked-in');
}

export async function completeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  return run(formData, 'complete', 'completed');
}

export async function hostCancelAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  const bookingId = formData.get('bookingId') as string;
  const reason = ((formData.get('reason') as string) ?? '').trim();
  if (!bookingId) return { error: 'Missing booking reference.' };

  // The server records HOST from the token; nothing is asserted here.
  const result = await apiPostSafe<Booking>(`/bookings/${bookingId}/cancel`, {
    reason: reason || null,
  });
  if (!result.ok) return { error: result.error };

  finish(
    '/host/bookings',
    'cancelled',
    result.data.bookingCode,
    pageOf(formData),
  );
}
