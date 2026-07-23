import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../errors/domain-errors';
import { RequestContextService } from '../context/request-context.service';
import type { ActorType } from '../../modules/booking/domain/types';
import { ROLES_KEY } from './decorators';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Role enforcement (runs after JwtAuthGuard). With a token, the verified
 * claims decide; platform ADMINs always pass. In the dev header-fallback
 * path the claimed actor type decides — acceptable only because production
 * never reaches this branch (JwtAuthGuard 401s first).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ctx: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<ActorType[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claims = request.authClaims;
    if (claims) {
      if (claims.role === 'ADMIN' || required.includes(claims.actorType)) {
        return true;
      }
      throw new ForbiddenError(
        `Requires one of: ${required.join(', ')}`,
      );
    }

    // Dev header fallback (never reached in production).
    const actorType = this.ctx.current()?.actorType ?? 'GUEST';
    if (required.includes(actorType) || actorType === 'ADMIN') return true;
    throw new ForbiddenError(`Requires one of: ${required.join(', ')}`);
  }
}
