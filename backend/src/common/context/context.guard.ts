import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';
import { ACTOR_TYPES, ActorType } from '../../modules/booking/domain/types';

/**
 * FIRST global guard: binds the request context (trace id + provisional
 * actor) into AsyncLocalStorage via enterWith, inside the request's own
 * async chain — every later guard, handler, worker call and DB transaction
 * inherits it. JwtAuthGuard then upgrades the actor to the verified JWT
 * identity. The x-actor-* headers only matter in the dev fallback; with a
 * token they are overwritten before anything trusts them.
 */
@Injectable()
export class ContextGuard implements CanActivate {
  constructor(private readonly ctx: RequestContextService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const rawActorType = (request.headers['x-actor-type'] as string) ?? 'GUEST';
    const actorType: ActorType = (ACTOR_TYPES as readonly string[]).includes(
      rawActorType,
    )
      ? (rawActorType as ActorType)
      : 'GUEST';

    this.ctx.enterWith({
      requestId: (request.headers['x-request-id'] as string) ?? randomUUID(),
      actorId: request.headers['x-actor-id'] as string | undefined,
      actorType,
    });
    return true;
  }
}
