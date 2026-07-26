/**
 * Shapes and endpoint for the availability socket.
 *
 * Kept free of React and of anything server-only so both the hook and plain
 * modules can import it.
 */

export type AvailabilityEventType =
  | 'HOLD_PLACED'
  | 'BOOKING_CONFIRMED'
  | 'INVENTORY_RELEASED';

export type DealEventType =
  | 'DEAL_ACTIVATED'
  | 'DEAL_CLAIMED'
  | 'DEAL_SOLD_OUT'
  | 'DEAL_ENDED';

export interface AvailabilityEvent {
  type: AvailabilityEventType;
  unitId: string;
  propertyId: string;
  bookingId: string;
  checkInUtc: string;
  checkOutUtc: string;
  occurredAt: string;
}

export interface DealEvent {
  type: DealEventType;
  dealId: string;
  unitId: string;
  quantityRemaining: number;
  occurredAt: string;
}

/** Everything the gateway sends, including its subscribe acknowledgement. */
export type RealtimeEvent =
  | AvailabilityEvent
  | DealEvent
  | { type: 'SUBSCRIBED'; all: boolean; unitIds: string[]; propertyIds: string[] }
  | { type: 'ERROR'; message: string };

export const isDealEvent = (e: RealtimeEvent): e is DealEvent =>
  e.type === 'DEAL_ACTIVATED' ||
  e.type === 'DEAL_CLAIMED' ||
  e.type === 'DEAL_SOLD_OUT' ||
  e.type === 'DEAL_ENDED';

export const isAvailabilityEvent = (e: RealtimeEvent): e is AvailabilityEvent =>
  e.type === 'HOLD_PLACED' ||
  e.type === 'BOOKING_CONFIRMED' ||
  e.type === 'INVENTORY_RELEASED';

export interface SubscribeFilter {
  /** Every event on the bus — for pages that show many units at once. */
  all?: boolean;
  unitId?: string;
  propertyId?: string;
}

/**
 * The socket URL the browser should dial.
 *
 * This cannot go through the Next rewrite that proxies /media: rewrites do not
 * carry an HTTP upgrade, so the browser has to reach the API directly. That
 * makes the URL deployment-specific, hence NEXT_PUBLIC_WS_URL — and it must be
 * wss:// wherever the page itself is https, or the browser blocks it as mixed
 * content.
 */
export function realtimeUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) return configured;

  if (typeof window === 'undefined') return null;

  // Dev fallback: the API sits beside the web app on the conventional port.
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.hostname}:3000/ws/availability`;
}
