'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiPostSafe } from '@/lib/api';
import { MODERATION_REASON_CODES } from '@/lib/moderation';
import type { ModerationReasonCode } from '@/lib/moderation';

type ActionState = { error?: string } | null;

/**
 * A decision changes which controls the page offers, so the button that
 * submitted has usually been replaced by the time the result lands and cannot
 * announce it. The outcome therefore travels back through the URL, matching
 * how the host booking actions already work.
 */
function finish(propertyId: string, outcome: string): never {
  revalidatePath('/admin/moderation');
  revalidatePath(`/admin/moderation/${propertyId}`);
  // The queue is the reviewer's working surface: after deciding, they want the
  // next listing, not the one they just finished with.
  redirect(`/admin/moderation?done=${outcome}`);
}

const isReasonCode = (value: unknown): value is ModerationReasonCode =>
  typeof value === 'string' &&
  (MODERATION_REASON_CODES as readonly string[]).includes(value);

export async function approveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  const propertyId = formData.get('propertyId') as string;
  if (!propertyId) return { error: 'Missing listing reference.' };

  const result = await apiPostSafe(
    `/admin/moderation/${propertyId}/approve`,
    {},
  );
  if (!result.ok) return { error: result.error };
  finish(propertyId, 'approved');
}

export async function rejectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  const propertyId = formData.get('propertyId') as string;
  const reasonCode = formData.get('reasonCode');
  const notes = ((formData.get('notes') as string) ?? '').trim();

  if (!propertyId) return { error: 'Missing listing reference.' };
  // Checked here as well as in the API and the database. A host cannot act on
  // or appeal a refusal with no stated cause, so this is worth three layers.
  if (!isReasonCode(reasonCode)) {
    return { error: 'Choose a reason for the rejection.' };
  }

  const result = await apiPostSafe(`/admin/moderation/${propertyId}/reject`, {
    reasonCode,
    notes: notes || undefined,
  });
  if (!result.ok) return { error: result.error };
  finish(propertyId, 'rejected');
}

export async function suspendAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  const propertyId = formData.get('propertyId') as string;
  const reasonCode = formData.get('reasonCode');
  const notes = ((formData.get('notes') as string) ?? '').trim();

  if (!propertyId) return { error: 'Missing listing reference.' };
  if (!isReasonCode(reasonCode)) {
    return { error: 'Choose a reason for the suspension.' };
  }

  const result = await apiPostSafe(`/admin/moderation/${propertyId}/suspend`, {
    reasonCode,
    notes: notes || undefined,
  });
  if (!result.ok) return { error: result.error };
  finish(propertyId, 'suspended');
}

export async function reinstateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<{ error?: string }> {
  const propertyId = formData.get('propertyId') as string;
  const notes = ((formData.get('notes') as string) ?? '').trim();
  if (!propertyId) return { error: 'Missing listing reference.' };

  const result = await apiPostSafe(
    `/admin/moderation/${propertyId}/reinstate`,
    { notes: notes || undefined },
  );
  if (!result.ok) return { error: result.error };
  finish(propertyId, 'reinstated');
}
