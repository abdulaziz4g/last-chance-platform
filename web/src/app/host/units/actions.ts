'use server';

import { revalidatePath } from 'next/cache';
import { deleteUnitPhoto, uploadUnitPhoto } from '@/lib/api';
import { ACCEPTED_IMAGE_TYPES, MAX_PHOTO_BYTES } from '@/lib/media';

export interface PhotoActionState {
  error?: string;
  success?: string;
}

/**
 * The API re-checks size, type (by magic bytes) and ownership — these checks
 * exist to fail fast and say something useful, not to be the gate.
 */
export async function uploadPhotoAction(
  _prev: PhotoActionState | null,
  formData: FormData,
): Promise<PhotoActionState> {
  const unitId = formData.get('unitId') as string;
  const file = formData.get('file');

  if (!unitId) return { error: 'Missing unit reference.' };
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image to upload.' };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: 'Images must be 5 MB or smaller.' };
  }
  if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { error: 'Only JPEG, PNG and WebP images can be uploaded.' };
  }

  const result = await uploadUnitPhoto(unitId, file);
  if (!result.ok) return { error: result.error };

  revalidatePath('/host/units');
  revalidatePath(`/units/${unitId}`);
  return { success: `Photo added (${result.data.photos.length} total).` };
}

export async function deletePhotoAction(
  _prev: PhotoActionState | null,
  formData: FormData,
): Promise<PhotoActionState> {
  const unitId = formData.get('unitId') as string;
  const url = formData.get('url') as string;
  if (!unitId || !url) return { error: 'Missing photo reference.' };

  const result = await deleteUnitPhoto(unitId, url);
  if (!result.ok) return { error: result.error };

  revalidatePath('/host/units');
  revalidatePath(`/units/${unitId}`);
  return { success: 'Photo removed.' };
}
