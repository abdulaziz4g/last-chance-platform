import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from './redis.tokens';
import { LockNotAcquiredError } from '../../common/errors/domain-errors';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'RedisLockService' });

export interface AcquiredLock {
  key: string;
  token: string;
  /**
   * Monotonic fencing token: strictly increases per key across all holders.
   * Downstream writers that must survive lock-expiry races (e.g. a paused
   * process resuming after its TTL) can reject work carrying a stale fence.
   */
  fence: number;
  ttlMs: number;
}

interface AcquireOptions {
  retries?: number;
  retryDelayMs?: number;
}

// Atomic compare-token release/extend: never delete a lock someone else now holds.
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

const EXTEND_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
else
  return 0
end`;

/**
 * Distributed lock over Redis (SET NX PX + owner-token release), with fencing
 * tokens.
 *
 * ROLE IN THE BOOKING FLOW — read this before "improving" it:
 * The lock is a CONTENTION SHIELD, not a correctness mechanism. It is held
 * for seconds around the availability-check-and-insert critical section so a
 * flash-deal thundering herd serializes in Redis instead of piling onto
 * PostgreSQL. Correctness — zero double-booking — is guaranteed by the
 * GIST exclusion constraint; if Redis loses every lock simultaneously, the
 * worst outcome is more 23P01 conflicts, never a double-booking. That is why
 * the 10-minute payment hold is a DB row, not a long-lived Redis lock.
 *
 * Deployment note: single Redis (with AOF + replica) is the deliberate v1
 * choice. For multi-master Redlock quorum, this class is the seam — the
 * interface stays, acquire/release fan out to N independent nodes.
 */
@Injectable()
export class RedisLockService implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquire(
    key: string,
    ttlMs: number,
    opts: AcquireOptions = {},
  ): Promise<AcquiredLock> {
    const { retries = 8, retryDelayMs = 150 } = opts;
    const token = randomUUID();

    for (let attempt = 0; attempt <= retries; attempt++) {
      const ok = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      if (ok === 'OK') {
        const fence = await this.redis.incr(`${key}:fence`);
        return { key, token, fence, ttlMs };
      }
      if (attempt < retries) {
        // Full jitter keeps a flash-deal herd from retrying in lockstep.
        await sleep(Math.random() * retryDelayMs * (attempt + 1));
      }
    }
    throw new LockNotAcquiredError(key);
  }

  async release(lock: AcquiredLock): Promise<void> {
    const released = await this.redis.eval(
      RELEASE_SCRIPT,
      1,
      lock.key,
      lock.token,
    );
    if (released !== 1) {
      // Not fatal (TTL already reclaimed it) but always worth seeing in logs:
      // it means the critical section outlived its TTL budget.
      log.warn({ key: lock.key }, 'Lock was not owned at release time');
    }
  }

  async extend(lock: AcquiredLock, ttlMs: number): Promise<boolean> {
    const ok = await this.redis.eval(
      EXTEND_SCRIPT,
      1,
      lock.key,
      lock.token,
      String(ttlMs),
    );
    return ok === 1;
  }

  /** Acquire → run → guaranteed release. The default for all callers. */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: (lock: AcquiredLock) => Promise<T>,
  ): Promise<T> {
    const lock = await this.acquire(key, ttlMs);
    try {
      return await fn(lock);
    } finally {
      await this.release(lock).catch((err) =>
        log.error({ err, key }, 'Lock release failed'),
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // REDIS_CLIENT is shared; closed centrally in queue/app shutdown.
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
