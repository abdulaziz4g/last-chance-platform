'use client';

import { useCallback, useState } from 'react';
import { useRealtime } from '@/components/use-realtime';
import type { RealtimeEvent } from '@/lib/realtime';
import {
  affectsForm,
  windowFromEvent,
  type TakenWindow,
} from './availability-decision';

/**
 * Warns when the window the reader is filling in gets taken while they type.
 *
 * Filling this form is slow — pick a date, a time, count the guests — and a
 * popular unit can be claimed in that gap. Without this the first sign is a
 * 409 on submit, after the reader has committed to the whole form.
 *
 * Advisory only, and deliberately so: the server blocks a wider range than
 * these events describe (it adds the unit's turnaround after checkout, which
 * the event does not carry), so a client-side check can only ever be
 * optimistic. Warning on what we can see is useful; refusing to submit on it
 * would sometimes block a booking the server would have accepted.
 */

/** Rendered in the viewer's zone, matching the clock the form is filled in. */
function formatWindow(from: number, to: number): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  return `${new Date(from).toLocaleString('en-GB', opts)} → ${new Date(
    to,
  ).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

export function AvailabilityWatch({
  unitId,
  checkIn,
  checkOut,
}: {
  unitId: string;
  checkIn: string;
  checkOut: string;
}) {
  const [latest, setLatest] = useState<TakenWindow | null>(null);

  useRealtime(
    { unitId },
    useCallback(
      (event: RealtimeEvent) => {
        const next = windowFromEvent(event, unitId);
        if (next) setLatest(next);
      },
      [unitId],
    ),
  );

  if (!latest) return null;

  // Only speak up about the window this reader actually wants. Chatter about
  // unrelated times on the same unit is noise they cannot act on.
  if (!affectsForm(latest, checkIn, checkOut)) return null;

  return latest.freed ? (
    <p
      role="status"
      className="rounded-lg bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300"
    >
      Good news — {formatWindow(latest.from, latest.to)} just opened up.
    </p>
  ) : (
    <p
      role="alert"
      className="rounded-lg bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300"
    >
      Someone just took {formatWindow(latest.from, latest.to)}, which overlaps
      your dates. You can still try — the hold may lapse — but another time is
      likelier to succeed.
    </p>
  );
}
