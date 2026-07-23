import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { AppConfigService } from '../../config/config.service';
import type { ActorType } from '../booking/domain/types';

export interface AuthClaims {
  /** users.id */
  sub: string;
  email: string;
  /** GUEST | HOST | ADMIN — resolved at login (host = owns host_profile). */
  actorType: ActorType;
  /** Back-office axis: USER | ADMIN (users.platform_role). */
  role: 'USER' | 'ADMIN';
}

const ISSUER = 'lastchance';

/** HS256 JWTs via jose. Asymmetric keys (RS256/EdDSA) are a config change
 *  here when token verification moves to edge services. */
@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: AppConfigService) {
    this.secret = new TextEncoder().encode(this.config.jwtSecret);
  }

  async sign(claims: AuthClaims): Promise<string> {
    return new SignJWT({
      email: claims.email,
      actorType: claims.actorType,
      role: claims.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${this.config.jwtTtlSeconds}s`)
      .sign(this.secret);
  }

  /** Returns claims or null (invalid/expired) — callers decide the failure mode. */
  async verify(token: string): Promise<AuthClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { issuer: ISSUER });
      if (typeof payload.sub !== 'string') return null;
      return {
        sub: payload.sub,
        email: (payload['email'] as string) ?? '',
        actorType: (payload['actorType'] as AuthClaims['actorType']) ?? 'GUEST',
        role: (payload['role'] as AuthClaims['role']) ?? 'USER',
      };
    } catch {
      return null;
    }
  }
}
