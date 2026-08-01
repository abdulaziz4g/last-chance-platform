import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.tokens';
import { AppConfigService } from '../../config/config.service';
import {
  RateLimitedError,
  ValidationFailedError,
} from '../../common/errors/domain-errors';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'OtpService' });

/** Spec: 2-minute validity. Long enough for a slow SMS, short enough to matter. */
const OTP_TTL_SECONDS = 120;
/** Wrong guesses before the code is burned. 6 digits is only 10^6. */
const MAX_ATTEMPTS = 5;
/** Requests per phone number per hour. */
const MAX_SENDS_PER_HOUR = 5;
/** Minimum gap between two sends to the same number. */
const RESEND_COOLDOWN_SECONDS = 60;

const SEND_WINDOW_SECONDS = 3600;

export interface OtpChallenge {
  /** Seconds until the code expires. */
  expiresInSec: number;
  /** Seconds before another code may be requested. */
  resendAfterSec: number;
}

interface StoredOtp {
  hash: string;
  attempts: number;
}

/**
 * Redis-backed one-time passcodes for phone sign-in.
 *
 * Four properties this deliberately has, each of which a naive version lacks:
 *
 * 1. THE CODE IS RANDOM. `randomInt` from node:crypto, not Math.random and
 *    emphatically not a fixed development constant — a hardcoded OTP is a
 *    total authentication bypass the moment it reaches an environment anyone
 *    can reach, and "we'll change it before launch" is how it ships.
 *
 * 2. ONLY A HASH IS STORED. Redis holds an HMAC of the code, never the code.
 *    A dump of Redis, a MONITOR session, or a replica leak therefore does not
 *    hand out live credentials.
 *
 * 3. ATTEMPTS ARE CAPPED AND THE CODE IS BURNED. Six digits is a million
 *    possibilities; without a cap an attacker walks the space inside the TTL.
 *
 * 4. SENDS ARE RATE-LIMITED AND COOLED DOWN. Otherwise the endpoint is a free
 *    SMS pump pointed at anyone's phone, billed to us.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Normalises a Saudi-first phone number to E.164.
   * Accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX and +9665XXXXXXXX.
   */
  normalisePhone(raw: string): string {
    const trimmed = raw.replace(/[\s()-]/g, '');
    let candidate = trimmed;

    if (candidate.startsWith('00')) candidate = `+${candidate.slice(2)}`;
    if (!candidate.startsWith('+')) {
      if (candidate.startsWith('0')) {
        // Local Saudi format: 05XXXXXXXX -> +9665XXXXXXXX
        candidate = `+966${candidate.slice(1)}`;
      } else if (candidate.startsWith('966')) {
        candidate = `+${candidate}`;
      } else {
        // Bare subscriber number, assume the default country.
        candidate = `+966${candidate}`;
      }
    }

    if (!/^\+[1-9][0-9]{6,14}$/.test(candidate)) {
      throw new ValidationFailedError('That does not look like a phone number', {
        phone: raw,
      });
    }
    return candidate;
  }

  /**
   * Issues a code for `phone` and returns it to the CALLER (not the client) so
   * the caller can hand it to the SMS provider. It is never returned over HTTP.
   */
  async issue(phone: string): Promise<{ code: string; challenge: OtpChallenge }> {
    await this.assertMaySend(phone);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const record: StoredOtp = { hash: this.hash(phone, code), attempts: 0 };

    await this.redis.set(
      this.codeKey(phone),
      JSON.stringify(record),
      'EX',
      OTP_TTL_SECONDS,
    );
    await this.redis.set(
      this.cooldownKey(phone),
      '1',
      'EX',
      RESEND_COOLDOWN_SECONDS,
    );

    const sends = await this.redis.incr(this.sendCountKey(phone));
    if (sends === 1) {
      await this.redis.expire(this.sendCountKey(phone), SEND_WINDOW_SECONDS);
    }

    // The code itself is never logged, in any environment. The MOCK notifier
    // prints it deliberately; this service must not, or production logs become
    // a credential store.
    log.info({ phoneSuffix: phone.slice(-4), sends }, 'OTP issued');

    return {
      code,
      challenge: {
        expiresInSec: OTP_TTL_SECONDS,
        resendAfterSec: RESEND_COOLDOWN_SECONDS,
      },
    };
  }

  /**
   * Checks a submitted code. Returns false for wrong-but-live codes and throws
   * only when the challenge is gone entirely, so a caller can tell "try again"
   * from "start over".
   */
  async verify(phone: string, submitted: string): Promise<boolean> {
    const key = this.codeKey(phone);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new ValidationFailedError(
        'That code has expired. Request a new one.',
        { reason: 'OTP_EXPIRED' },
      );
    }

    const record = JSON.parse(raw) as StoredOtp;

    // Compare digests, not codes, and in constant time: a length-or-content
    // early exit leaks how much of a guess was right.
    const expected = Buffer.from(record.hash, 'hex');
    const actual = Buffer.from(this.hash(phone, submitted), 'hex');
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    if (matches) {
      // Single use: consume it before returning so a replay cannot follow.
      await this.redis.del(key, this.sendCountKey(phone));
      log.info({ phoneSuffix: phone.slice(-4) }, 'OTP verified');
      return true;
    }

    const attempts = record.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.redis.del(key);
      log.warn(
        { phoneSuffix: phone.slice(-4), attempts },
        'OTP burned after too many wrong attempts',
      );
      throw new ValidationFailedError(
        'Too many incorrect attempts. Request a new code.',
        { reason: 'OTP_ATTEMPTS_EXCEEDED' },
      );
    }

    // Preserve the ORIGINAL expiry: refreshing the TTL on every wrong guess
    // would let an attacker keep a challenge alive indefinitely.
    const ttl = await this.redis.ttl(key);
    await this.redis.set(
      key,
      JSON.stringify({ ...record, attempts }),
      'EX',
      ttl > 0 ? ttl : OTP_TTL_SECONDS,
    );
    return false;
  }

  // -------------------------------------------------------------------------

  private async assertMaySend(phone: string): Promise<void> {
    const cooldown = await this.redis.ttl(this.cooldownKey(phone));
    if (cooldown > 0) {
      throw new RateLimitedError(cooldown);
    }

    const sends = Number((await this.redis.get(this.sendCountKey(phone))) ?? 0);
    if (sends >= MAX_SENDS_PER_HOUR) {
      const window = await this.redis.ttl(this.sendCountKey(phone));
      throw new RateLimitedError(window > 0 ? window : SEND_WINDOW_SECONDS);
    }
  }

  /**
   * Keyed HMAC rather than a bare digest: without the secret, an attacker who
   * obtains the stored value cannot precompute the million possible hashes.
   * The phone number is mixed in so a hash is useless against another number.
   */
  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.config.otpSecret)
      .update(`${phone}:${code}`)
      .digest('hex');
  }

  private codeKey = (phone: string): string => `otp:code:${phone}`;
  private cooldownKey = (phone: string): string => `otp:cooldown:${phone}`;
  private sendCountKey = (phone: string): string => `otp:sends:${phone}`;
}
