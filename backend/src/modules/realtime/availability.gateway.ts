import { Inject } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import type { WebSocket } from 'ws';
import { REDIS_SUBSCRIBER } from '../../infrastructure/redis/redis.tokens';
import {
  AVAILABILITY_CHANNEL,
  AvailabilityEvent,
} from '../booking/events/booking-events.publisher';
import { DEALS_CHANNEL } from '../deals/events/deal-events.publisher';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'AvailabilityGateway' });

interface ClientFilter {
  all: boolean;
  unitIds: Set<string>;
  propertyIds: Set<string>;
}

/**
 * The real-time availability fan-out: Redis Pub/Sub -> every app instance's
 * gateway -> its connected sockets. Horizontally scalable by construction —
 * each pod subscribes to the same channel, clients land on any pod.
 *
 * Client protocol (JSON text frames):
 *   -> { "action": "subscribe", "unitId"?: "...", "propertyId"?: "...", "all"?: true }
 *   -> { "action": "unsubscribe" }              (clears filters)
 *   <- { "type": "SUBSCRIBED", ... ack ... }
 *   <- AvailabilityEvent                        (HOLD_PLACED | BOOKING_CONFIRMED
 *                                                | INVENTORY_RELEASED)
 * Mobile's AvailabilityFeed consumes exactly this contract.
 */
@WebSocketGateway({ path: '/ws/availability' })
export class AvailabilityGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly clients = new Map<WebSocket, ClientFilter>();

  constructor(@Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis) {}

  afterInit(): void {
    // One gateway relays BOTH availability and flash-deal events — clients get
    // hold/release changes and live deal countdowns/sold-out flips over the
    // same socket. Both event shapes carry unitId, so the same filter applies.
    void this.subscriber.subscribe(AVAILABILITY_CHANNEL, DEALS_CHANNEL).then(
      () => log.info('Subscribed to availability + deals channels'),
      (err: unknown) => log.error({ err }, 'Realtime subscribe failed'),
    );
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === AVAILABILITY_CHANNEL || channel === DEALS_CHANNEL) {
        this.fanOut(message);
      }
    });
  }

  handleConnection(client: WebSocket): void {
    this.clients.set(client, {
      all: false,
      unitIds: new Set(),
      propertyIds: new Set(),
    });

    client.on('message', (raw: Buffer | string) => {
      const filter = this.clients.get(client);
      if (!filter) return;
      try {
        const msg = JSON.parse(String(raw)) as {
          action?: string;
          unitId?: string;
          propertyId?: string;
          all?: boolean;
        };
        if (msg.action === 'subscribe') {
          if (msg.all === true) filter.all = true;
          if (msg.unitId) filter.unitIds.add(msg.unitId);
          if (msg.propertyId) filter.propertyIds.add(msg.propertyId);
          client.send(
            JSON.stringify({
              type: 'SUBSCRIBED',
              all: filter.all,
              unitIds: [...filter.unitIds],
              propertyIds: [...filter.propertyIds],
            }),
          );
        } else if (msg.action === 'unsubscribe') {
          filter.all = false;
          filter.unitIds.clear();
          filter.propertyIds.clear();
        }
      } catch {
        client.send(JSON.stringify({ type: 'ERROR', message: 'Malformed frame' }));
      }
    });
  }

  handleDisconnect(client: WebSocket): void {
    this.clients.delete(client);
  }

  private fanOut(message: string): void {
    let event: AvailabilityEvent;
    try {
      event = JSON.parse(message) as AvailabilityEvent;
    } catch {
      return;
    }
    for (const [client, filter] of this.clients) {
      const matches =
        filter.all ||
        filter.unitIds.has(event.unitId) ||
        filter.propertyIds.has(event.propertyId);
      if (matches && client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  }
}
