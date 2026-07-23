import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'BookingEventsPublisher' });

export const AVAILABILITY_CHANNEL = 'lc.events.availability';

export type AvailabilityEventType =
  | 'HOLD_PLACED'
  | 'BOOKING_CONFIRMED'
  | 'INVENTORY_RELEASED'; // expiry or cancellation

export interface AvailabilityEvent {
  type: AvailabilityEventType;
  unitId: string;
  propertyId: string;
  bookingId: string;
  checkInUtc: string;
  checkOutUtc: string;
  occurredAt: string;
}

/**
 * Publishes availability changes over Redis Pub/Sub. The Phase 3 WebSocket
 * gateway subscribes on every app instance and fans out to connected clients
 * — this is what makes a flash-deal unit visibly "gone" across all devices
 * within sub-second latency.
 *
 * Fire-and-forget by design: an event bus hiccup must never fail a booking
 * that is already durably committed in PostgreSQL.
 */
@Injectable()
export class BookingEventsPublisher {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  publish(event: Omit<AvailabilityEvent, 'occurredAt'>): void {
    const payload: AvailabilityEvent = {
      ...event,
      occurredAt: new Date().toISOString(),
    };
    void this.redis
      .publish(AVAILABILITY_CHANNEL, JSON.stringify(payload))
      .catch((err) =>
        log.error({ err, event: payload }, 'Failed to publish availability event'),
      );
  }
}
