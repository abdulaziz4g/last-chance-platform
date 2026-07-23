import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors/domain-errors';
import { RequestContextService } from '../context/request-context.service';
import { AppConfigService } from '../../config/config.service';
import { AuthClaims, TokenService } from '../../modules/auth/token.service';
import { PUBLIC_KEY } from './decorators';

export interface AuthenticatedRequest extends FastifyRequest {
  authClaims?: AuthClaims;
}

/**
 * Global authentication guard.
 *
 * - @Public() routes pass untouched.
 * - A valid Bearer token binds the verified identity into the request context
 *   (which the DB layer stamps onto transactions — audit rows now carry the
 *   REAL actor).
 * - No token: development mode falls back to the legacy x-actor-* headers
 *   (loudly, by design — the web console and older smokes still work);
 *   production rejects with 401. An invalid/expired token is ALWAYS 401 —
 *   presenting a bad token is never downgraded to anonymous.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
    private readonly ctx: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (header?.startsWith('Bearer ')) {
      const claims = await this.tokens.verify(header.slice(7));
      if (!claims) throw new UnauthorizedError('Invalid or expired token');
      request.authClaims = claims;
      this.ctx.update({ actorId: claims.sub, actorType: claims.actorType });
      return true;
    }

    if (this.config.authDevFallback) return true;
    throw new UnauthorizedError();
  }
}
