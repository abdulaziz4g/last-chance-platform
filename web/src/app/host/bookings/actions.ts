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
function finish(path: string, key: string, bookingCode: string): never {
  revalidatePath('/host/bookings');
  revalidatePath('/host');
  redirect(`${path}?done=${key}&code=${encodeURIComponent(bookingCode)}`);
}

async function run(
  bookingId: string,
  endpoint: string,
  key: string,
): Promise<{ error?: string }> {
  if (!bookingId) return { error: 'Missing booking reference.' };

  const result = await apiPostSafe<Booking>(
    `/bookings/${bookingId}/${endpoint}`,
    {},
  );
  if (!result.ok) return { error: result.error };

  finish('/host/bookings', key, result.data.bookingCode);
}

export async function checkInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  return run(formData.get('bookingId') as string, 'check-in', 'checked-in');
}

export async function completeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  return run(formData.get('bookingId') as string, 'complete', 'completed');
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

  finish('/host/bookings', 'cancelled', result.data.bookingCode);
}
