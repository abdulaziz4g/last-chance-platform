/**
 * Upload limits, shared by the browser and the server actions.
 *
 * Kept out of lib/api.ts deliberately: that module reaches for next/headers to
 * read the session, which cannot be pulled into a client bundle. These are
 * plain values, so both sides can import them.
 *
 * The API enforces the same rules independently — and checks the actual magic
 * bytes rather than the declared type. These exist to fail fast in the form.
 */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
