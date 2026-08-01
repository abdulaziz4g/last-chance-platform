'use client';

import Image from 'next/image';
import { useActionState, useRef } from 'react';
import { deletePhotoAction, uploadPhotoAction } from './actions';
import { useActionToast } from '@/components/toast';
import { ACCEPTED_IMAGE_TYPES } from '@/lib/media';

function DeleteButton({ unitId, url }: { unitId: string; url: string }) {
  const [state, formAction, pending] = useActionState(deletePhotoAction, null);
  useActionToast(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="url" value={url} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Remove photo"
        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
      >
        {pending ? '·' : '×'}
      </button>
    </form>
  );
}

export function PhotoManager({
  unitId,
  unitName,
  photos,
}: {
  unitId: string;
  unitName: string;
  photos: string[];
}) {
  const [state, formAction, pending] = useActionState(uploadPhotoAction, null);
  useActionToast(state);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div
            key={src}
            className="group relative h-20 w-28 overflow-hidden rounded-lg bg-zinc-100 dark:bg-white/[0.04]"
          >
            <Image
              src={src}
              alt={`${unitName} — photo ${i + 1}`}
              fill
              sizes="112px"
              className="object-cover"
            />
            {i === 0 && (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                Cover
              </span>
            )}
            <DeleteButton unitId={unitId} url={src} />
          </div>
        ))}

        {photos.length === 0 && (
          <p className="text-xs text-taupe-500 dark:text-zinc-400">
            No photos yet — the first you add becomes the cover.
          </p>
        )}
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="unitId" value={unitId} />
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          required
          // Submitting on selection keeps this to one interaction; the form is
          // a single field, so a separate button would only add a step.
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="block w-full max-w-xs text-xs text-taupe-500 file:mr-3 file:rounded-md file:border-0 file:bg-coral-500/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-coral-600 hover:file:bg-coral-500/20 dark:text-zinc-400 dark:file:text-coral-300"
        />
        {pending && (
          <span className="text-xs text-zinc-400">Uploading…</span>
        )}
      </form>
    </div>
  );
}
