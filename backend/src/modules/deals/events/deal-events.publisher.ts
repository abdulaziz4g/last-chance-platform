import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.tokens';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'DealEventsPublisher' });

export const DEALS_CHANNEL = 'lc.events.deals';

export type DealEventType =
  | 'DEAL_ACTIVATED'
  | 'DEAL_CLAIMED'
  | 'DEAL_SOLD_OUT'
  | 'DEAL_ENDED';

export interface DealEvent {
  type: DealEventType;
  dealId: string;
  unitId: string;
  quantityRemaining: number;
  occurredAt: string;
}

/**
 * Publishes flash-deal state changes over Redis Pub/Sub. The WebSocket
 * gateway relays them to subscribed clients, so a countdown ticking down or a
 * "3 left → SOLD OUT" flip lands on every device sub-second. Fire-and-forget:
 * a bus hiccup never fails a claim already committed in PostgreSQL.
 */
@Injectable()
export class DealEventsPublisher {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  publish(event: Omit<DealEvent, 'occurredAt'>): void {
    const payload: DealEvent = { ...event, occurredAt: new Date().toISOString() };
    void this.redis
      .publish(DEALS_CHANNEL, JSON.stringify(payload))
      .catch((err) => log.error({ err, payload }, 'Failed to publish deal event'));
  }
}
