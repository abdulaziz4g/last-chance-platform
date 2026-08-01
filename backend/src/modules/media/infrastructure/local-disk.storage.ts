import { Injectable } from '@nestjs/common';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { StoragePort } from '../domain/storage.port';

/** Everything is served from here; also the escape-check boundary. */
export const MEDIA_ROOT = resolve(process.cwd(), 'var', 'uploads');

/** The URL prefix the static handler is mounted on. */
export const MEDIA_URL_PREFIX = '/media';

@Injectable()
export class LocalDiskStorage implements StoragePort {
  /**
   * Resolves a key inside MEDIA_ROOT, refusing anything that escapes it.
   * Keys are generated server-side today, but a traversal check at the one
   * place that turns a key into a path is worth having regardless — this is
   * the function that would otherwise write anywhere on the filesystem.
   */
  private pathFor(key: string): string {
    const full = resolve(MEDIA_ROOT, key);
    if (full !== MEDIA_ROOT && !full.startsWith(MEDIA_ROOT + sep)) {
      throw new Error(`Refusing to write outside the media root: ${key}`);
    }
    return full;
  }

  async save(key: string, body: Buffer, _contentType: string): Promise<string> {
    const full = this.pathFor(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    return this.urlFor(key);
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(this.pathFor(key), { force: true });
    } catch {
      /* already gone, or never existed */
    }
  }

  urlFor(key: string): string {
    return `${MEDIA_URL_PREFIX}/${key.split(sep).join('/')}`;
  }

  /** Reverses urlFor, for deletes that arrive as a URL. Null if not ours. */
  static keyFromUrl(url: string): string | null {
    const prefix = `${MEDIA_URL_PREFIX}/`;
    if (!url.startsWith(prefix)) return null;
    const key = url.slice(prefix.length);
    // No traversal, no absolute paths, no empty segments.
    if (!key || key.includes('..') || key.startsWith('/')) return null;
    return key;
  }

  static async ensureRoot(): Promise<void> {
    await mkdir(join(MEDIA_ROOT), { recursive: true });
  }
}
