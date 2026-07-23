import { Injectable } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing on node:crypto scrypt — no native-module dependency,
 * memory-hard, OWASP-acceptable parameters. Format is self-describing so
 * parameters can be raised later and old hashes still verify:
 *   scrypt:N:r:p:<salt b64>:<hash b64>
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

@Injectable()
export class PasswordService {
  hash(password: string): string {
    const salt = randomBytes(16);
    const derived = scryptSync(password, salt, KEY_LEN, { N, r: R, p: P });
    return `scrypt:${N}:${R}:${P}:${salt.toString('base64')}:${derived.toString('base64')}`;
  }

  verify(password: string, stored: string): boolean {
    const parts = stored.split(':');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    const derived = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(derived, expected);
  }
}
