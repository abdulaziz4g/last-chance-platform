'use server';

import { revalidatePath } from 'next/cache';
import { apiPostSafe } from '@/lib/api';
import { isInstant } from '@/lib/local-time';
import type { FlashDeal } from '@/lib/api';

export async function createDealAction(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const unitId = formData.get('unitId') as string;
  const title = formData.get('title') as string;
  const discountPct = Number(formData.get('discountPct'));
  const startsAt = formData.get('startsAt') as string;
  const endsAt = formData.get('endsAt') as string;
  const quantityTotal = Number(formData.get('quantityTotal'));

  if (!unitId || !title || !startsAt || !endsAt) {
    return { error: 'All fields are required.' };
  }
  if (discountPct < 5 || discountPct > 90) {
    return { error: 'Discount must be between 5% and 90%.' };
  }
  if (quantityTotal < 1) {
    return { error: 'Quantity must be at least 1.' };
  }
  // Converted in the browser; re-parsing here would resolve the host's wall
  // clock against the server's zone and shift the whole deal window.
  if (!isInstant(startsAt) || !isInstant(endsAt)) {
    return { error: 'Please pick a start and end time.' };
  }

  const result = await apiPostSafe<FlashDeal>('/deals', {
    unitId,
    title,
    discountPct,
    startsAt,
    endsAt,
    quantityTotal,
  });

  if (!result.ok) return { error: result.error };

  // Stay on the page: the host usually creates several deals in a row, and the
  // refreshed table below the form is the confirmation.
  revalidatePath('/host/deals');
  return { success: `“${title}” is live — ${discountPct}% off, ${quantityTotal} slots.` };
}
