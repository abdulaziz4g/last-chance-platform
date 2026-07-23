import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  EmailTakenError,
  InvalidCredentialsError,
} from '../../common/errors/domain-errors';
import { PasswordService } from './password.service';
import { AuthClaims, TokenService } from './token.service';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'AuthService' });

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string; fullName: string; actorType: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
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

  private async issueFor(userId: string): Promise<AuthResult> {
    const res = await this.db.query<{
      id: string;
      email: string;
      full_name: string;
      platform_role: 'USER' | 'ADMIN';
      is_host: boolean;
    }>(
      `SELECT u.id, u.email::text, u.full_name, u.platform_role,
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
        fullName: u.full_name,
        actorType: claims.actorType,
      },
    };
  }
}
