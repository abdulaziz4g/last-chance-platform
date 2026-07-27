import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.tokens';
import { RateLimitedError } from '../errors/domain-errors';
import { RATE_LIMIT_KEY, RateLimitSpec } from './decorators';

const DEFAULT_LIMIT: RateLimitSpec = { limit: 120, windowSec: 60 };

/**
 * Redis fixed-window rate limiter, keyed per route handler + client IP —
 * one shared budget across every pod (in-memory limiters lie behind a load
 * balancer). Registered first among global guards so throttling happens
 * before token verification work.
 *
 * Sensitive routes tighten via @RateLimit (login: 10/min, holds: 20/min).
 * A Redis outage FAILS OPEN: availability over throttling — the DB
 * constraints still protect correctness.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const spec =
      this.reflector.getAllAndOverride<RateLimitSpec | undefined>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? DEFAULT_LIMIT;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const key = `rl:${route}:${request.ip}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.pexpire(key, spec.windowSec * 1000);
      }
      if (count > spec.limit) {
        throw new RateLimitedError(await this.retryAfterSec(key, spec));
      }
      return true;
    } catch (e) {
      if (e instanceof RateLimitedError) throw e;
      return true; // Redis hiccup: fail open
    }
  }

  /**
   * Seconds until this window actually reopens.
   *
   * Reporting the full window instead would overstate the wait by however
   * long the window has already run — a client that trips the limit a second
   * before it resets would be told to wait the whole minute, and any countdown
   * built on that is simply wrong. Falls back to the window only when Redis
   * cannot tell us (-1 no expiry, -2 key already gone).
   */
  private async retryAfterSec(
    key: string,
    spec: RateLimitSpec,
  ): Promise<number> {
    const ttlMs = await this.redis.pttl(key);
    if (ttlMs <= 0) return spec.windowSec;
    return Math.max(1, Math.ceil(ttlMs / 1000));
  }
}
