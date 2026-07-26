'use client';

import { useEffect, useRef, useState } from 'react';
import {
  realtimeUrl,
  type RealtimeEvent,
  type SubscribeFilter,
} from '@/lib/realtime';

/** Backoff between reconnects, in ms. Repeats the last value indefinitely. */
const BACKOFF = [1_000, 2_000, 5_000, 10_000, 30_000];

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

/**
 * Subscribes to the availability socket and hands each event to `onEvent`.
 *
 * Realtime here is an enhancement, never the source of truth: the page has
 * already rendered correct server data, and these events only nudge it. So a
 * socket that never connects is not an error state worth shouting about — it
 * just means the page behaves exactly as it did before this existed.
 *
 * Reconnects forever with backoff rather than giving up, because the common
 * cause is the API restarting under a developer or a deploy, and a page that
 * silently stops updating until reloaded is worse than a few retries.
 */
export function useRealtime(
  filter: SubscribeFilter,
  onEvent: (event: RealtimeEvent) => void,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  // Held in refs so a changing callback or filter object identity does not
  // tear the socket down and reconnect on every parent render.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const filterRef = useRef(filter);
  filterRef.current = filter;

  const filterKey = `${filter.all ?? false}|${filter.unitId ?? ''}|${filter.propertyId ?? ''}`;

  useEffect(() => {
    const url = realtimeUrl();
    if (!url) return;

    let socket: WebSocket | null = null;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;

      try {
        socket = new WebSocket(url);
      } catch {
        schedule();
        return;
      }

      socket.onopen = () => {
        if (closed) return;
        retry = 0;
        setStatus('live');
        socket?.send(
          JSON.stringify({ action: 'subscribe', ...filterRef.current }),
        );
      };

      socket.onmessage = (message) => {
        if (closed) return;
        try {
          handlerRef.current(JSON.parse(String(message.data)) as RealtimeEvent);
        } catch {
          /* a frame we cannot parse is not worth breaking the page over */
        }
      };

      socket.onerror = () => {
        // `onclose` always follows, which is where reconnection is handled.
        socket?.close();
      };

      socket.onclose = () => {
        if (closed) return;
        setStatus('offline');
        schedule();
      };
    };

    const schedule = () => {
      if (closed) return;
      const wait = BACKOFF[Math.min(retry, BACKOFF.length - 1)];
      retry += 1;
      setStatus('connecting');
      reconnectTimer = setTimeout(connect, wait);
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      // Detach before closing: React StrictMode mounts twice in development,
      // and a late close event from the discarded socket would otherwise
      // schedule a reconnect the new effect knows nothing about.
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close();
        }
      }
    };
  }, [filterKey]);

  return status;
}
