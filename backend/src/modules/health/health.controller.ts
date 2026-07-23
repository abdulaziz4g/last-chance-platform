import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { Public } from '../../common/auth/decorators';

/**
 * Liveness/readiness endpoint for Kubernetes probes and the load balancer.
 * "ok" requires both PostgreSQL and Redis to answer.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async health(): Promise<{
    status: 'ok' | 'degraded';
    postgres: boolean;
    redis: boolean;
  }> {
    const [pg, redis] = await Promise.all([
      this.db.healthCheck().catch(() => false),
      this.redis
        .ping()
        .then((r) => r === 'PONG')
        .catch(() => false),
    ]);
    return { status: pg && redis ? 'ok' : 'degraded', postgres: pg, redis };
  }
}
