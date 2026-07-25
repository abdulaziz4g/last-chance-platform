import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ForbiddenError,
  UnitNotFoundError,
  ValidationFailedError,
} from '../../../common/errors/domain-errors';
import { STORAGE_PORT, type StoragePort } from '../domain/storage.port';
import { LocalDiskStorage } from '../infrastructure/local-disk.storage';
import {
  MAX_PHOTOS_PER_UNIT,
  UnitPhotoRepository,
} from '../infrastructure/unit-photo.repository';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Accepted image types, keyed by the magic bytes that actually identify them.
 * A declared content-type is whatever the uploader felt like sending, so the
 * bytes are what decide — this is what stops an executable or an HTML file
 * being stored under an image name and served back from our origin.
 */
const SIGNATURES: { ext: string; mime: string; match: (b: Buffer) => boolean }[] = [
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    match: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    match: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

function detectImage(bytes: Buffer): { ext: string; mime: string } {
  if (bytes.length < 12) {
    throw new ValidationFailedError('That file is too small to be an image');
  }
  const hit = SIGNATURES.find((s) => s.match(bytes));
  if (!hit) {
    throw new ValidationFailedError(
      'Only JPEG, PNG and WebP images can be uploaded',
    );
  }
  return { ext: hit.ext, mime: hit.mime };
}

@Injectable()
export class UnitPhotoService {
  constructor(
    private readonly photos: UnitPhotoRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** Throws unless the caller owns the unit's property, or is an operator. */
  private async assertMayEdit(
    unitId: string,
    userId: string | null,
    isOperator: boolean,
  ): Promise<void> {
    const hostId = await this.photos.findOwnerHostId(unitId);
    if (!hostId) throw new UnitNotFoundError(unitId);
    if (isOperator) return;
    if (!userId || hostId !== userId) {
      throw new ForbiddenError('This unit is not yours');
    }
  }

  async list(unitId: string): Promise<string[]> {
    return this.photos.list(unitId);
  }

  async upload(params: {
    unitId: string;
    bytes: Buffer;
    userId: string | null;
    isOperator: boolean;
  }): Promise<string[]> {
    const { unitId, bytes, userId, isOperator } = params;

    await this.assertMayEdit(unitId, userId, isOperator);

    if (bytes.length > MAX_PHOTO_BYTES) {
      throw new ValidationFailedError('Images must be 5 MB or smaller', {
        maxBytes: MAX_PHOTO_BYTES,
      });
    }
    const { ext, mime } = detectImage(bytes);

    // Server-generated key: the uploader's filename never reaches the
    // filesystem, so there is nothing to sanitise and nothing to collide.
    const key = `units/${unitId}/${randomUUID()}.${ext}`;
    const url = await this.storage.save(key, bytes, mime);

    const updated = await this.photos.append(unitId, url);
    if (updated.length === 0) {
      // The cap rejected it — do not leave the orphan on disk.
      await this.storage.remove(key);
      throw new ValidationFailedError(
        `A unit can have at most ${MAX_PHOTOS_PER_UNIT} photos`,
        { maxPhotos: MAX_PHOTOS_PER_UNIT },
      );
    }
    return updated;
  }

  async remove(params: {
    unitId: string;
    url: string;
    userId: string | null;
    isOperator: boolean;
  }): Promise<string[]> {
    const { unitId, url, userId, isOperator } = params;

    await this.assertMayEdit(unitId, userId, isOperator);

    const remaining = await this.photos.remove(unitId, url);

    // Only reclaim bytes we own; an externally hosted URL is not ours to
    // delete, and the key check refuses anything that is not under our prefix.
    const key = LocalDiskStorage.keyFromUrl(url);
    if (key) await this.storage.remove(key);

    return remaining;
  }
}
