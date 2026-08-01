import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  EmailTakenError,
  InvalidCredentialsError,
} from '../../common/errors/domain-errors';
import { PasswordService } from './password.service';
import { AuthClaims, TokenService } from './token.service';
import { OtpService, type OtpChallenge } from './otp.service';
import { OtpNotifierService } from '../notifications/application/otp-notifier.service';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'AuthService' });

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    /** Null for phone-first accounts — see migration 0017. */
    email: string | null;
    phone: string | null;
    fullName: string;
    actorType: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly notifier: OtpNotifierService,
  ) {}

  async register(email: string, password: string, fullName: string): Promise<AuthResult> {
    const hash = this.passwords.hash(password);
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, auth_provider, full_name)
       VALUES ($1, $2, 'password', $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, hash, fullName],
    );
    if (!res.rows[0]) throw new EmailTakenError(email);

    log.info({ userId: res.rows[0].id }, 'User registered');
    return this.issueFor(res.rows[0].id);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const res = await this.db.query<{
      id: string;
      password_hash: string | null;
      status: string;
    }>(
      `SELECT id, password_hash, status::text FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    const user = res.rows[0];
    // Verify against a dummy hash on unknown emails: login timing must not
    // reveal account existence.
    const hash =
      user?.password_hash ??
      'scrypt:16384:8:1:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
    const valid = this.passwords.verify(password, hash);
    if (!user || !valid || user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError();
    }

    await this.db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [
      user.id,
    ]);
    return this.issueFor(user.id);
  }

  /**
   * Step 1 of phone sign-in: issue a code and hand it to the SMS provider.
   *
   * Returns the same shape whether or not an account exists. Replying
   * differently would turn this endpoint into an account-enumeration oracle —
   * anyone could test whether a phone number is registered here.
   */
  async requestPhoneOtp(rawPhone: string): Promise<OtpChallenge> {
    const phone = this.otp.normalisePhone(rawPhone);
    const { code, challenge } = await this.otp.issue(phone);

    await this.notifier.sendOtp(phone, code);
    return challenge;
  }

  /**
   * Step 2: exchange a correct code for a session, creating the account on
   * first use. Verification is what makes the number real, so phone_verified_at
   * is set here and nowhere else.
   */
  async verifyPhoneOtp(rawPhone: string, code: string): Promise<AuthResult> {
    const phone = this.otp.normalisePhone(rawPhone);

    const ok = await this.otp.verify(phone, code);
    if (!ok) throw new InvalidCredentialsError();

    // Upsert on the phone number. auth_provider 'phone' accounts have no
    // password_hash, which migration 0017 permits explicitly.
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO users (phone, auth_provider, full_name, phone_verified_at)
       VALUES ($1, 'phone', $2, now())
       ON CONFLICT (phone) DO UPDATE
         SET phone_verified_at = now(),
             last_login_at     = now()
       RETURNING id`,
      [phone, `Guest ${phone.slice(-4)}`],
    );
    const userId = res.rows[0].id;

    log.info({ userId, phoneSuffix: phone.slice(-4) }, 'Phone sign-in completed');
    return this.issueFor(userId);
  }

  private async issueFor(userId: string): Promise<AuthResult> {
    const res = await this.db.query<{
      id: string;
      email: string | null;
      phone: string | null;
      full_name: string;
      platform_role: 'USER' | 'ADMIN';
      is_host: boolean;
    }>(
      `SELECT u.id, u.email::text, u.phone::text, u.full_name, u.platform_role,
              EXISTS (SELECT 1 FROM host_profiles h WHERE h.user_id = u.id) AS is_host
       FROM users u WHERE u.id = $1`,
      [userId],
    );
    const u = res.rows[0];
    const claims: AuthClaims = {
      sub: u.id,
      email: u.email,
      actorType: u.platform_role === 'ADMIN' ? 'ADMIN' : u.is_host ? 'HOST' : 'GUEST',
      role: u.platform_role,
    };
    return {
      accessToken: await this.tokens.sign(claims),
      user: {
        id: u.id,
        email: u.email,
        phone: u.phone,
        fullName: u.full_name,
        actorType: claims.actorType,
      },
    };
  }
}
