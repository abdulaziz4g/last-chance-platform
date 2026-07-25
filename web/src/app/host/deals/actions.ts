'use server';

import { redirect } from 'next/navigation';
import { apiPostSafe } from '@/lib/api';
import type { FlashDeal } from '@/lib/api';

export async function createDealAction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
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

  const result = await apiPostSafe<FlashDeal>('/deals', {
    unitId,
    title,
    discountPct,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    quantityTotal,
  });

  if (!result.ok) return { error: result.error };

  redirect('/host/deals');
}
