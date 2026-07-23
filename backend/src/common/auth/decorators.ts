import { SetMetadata } from '@nestjs/common';
import type { ActorType } from '../../modules/booking/domain/types';

export const PUBLIC_KEY = 'lc:public';
/** Route requires no authentication (health, docs, webhooks, auth itself). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_KEY, true);

export const ROLES_KEY = 'lc:roles';
/** Restrict to actor types; ADMIN platform_role always passes. */
export const Roles = (
  ...roles: ActorType[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

export const RATE_LIMIT_KEY = 'lc:ratelimit';
export interface RateLimitSpec {
  limit: number;
  windowSec: number;
}
/** Override the default per-route+ip rate limit. */
export const RateLimit = (
  limit: number,
  windowSec: number,
): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSec } satisfies RateLimitSpec);
