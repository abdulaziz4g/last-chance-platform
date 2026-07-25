/**
 * Where uploaded bytes live.
 *
 * The local-disk driver is what ships today: it is honest for a single node
 * and needs no credentials. Object storage (S3, R2, Spaces) implements the
 * same three methods and swaps in at the module provider — nothing above this
 * interface knows the difference, which is the point of having it.
 */
export interface StoragePort {
  /**
   * Persists bytes under `key` and returns the path a browser can fetch it
   * from. The key is caller-chosen and already sanitised.
   */
  save(key: string, body: Buffer, contentType: string): Promise<string>;

  /** Best-effort removal; a missing object is not an error. */
  remove(key: string): Promise<void>;

  /** The public path for a key that is already stored. */
  urlFor(key: string): string;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
