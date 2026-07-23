import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/config.service';
import { RedisLockService } from './redis-lock.service';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.tokens';

export { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.tokens';

/**
 * Two dedicated connections: a general-purpose client (commands + publish)
 * and a subscriber (a Redis connection in subscribe mode cannot run other
 * commands). BullMQ manages its own connections separately (queue.module).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Redis(config.redisUrl, { lazyConnect: false }),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Redis(config.redisUrl, { lazyConnect: false }),
    },
    RedisLockService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, RedisLockService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}
