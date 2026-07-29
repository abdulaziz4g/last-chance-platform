'use client';

import { useCallback, useState } from 'react';
import { useRealtime } from '@/components/use-realtime';
import { isAvailabilityEvent, type RealtimeEvent } from '@/lib/realtime';
import { parseLocalInput } from '@/lib/local-time';

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

interface Taken {
  from: number;
  to: number;
  freed: boolean;
}

/** Half-open overlap: touching end-to-start is not a clash. */
const overlaps = (aFrom: number, aTo: number, bFrom: number, bTo: number) =>
  aFrom < bTo && bFrom < aTo;

/**
 * Both sides of the comparison must be real instants. The form fields are the
 * guest's wall clock, the events carry UTC — reading either in the wrong zone
 * makes the overlap check quietly compare different clocks, which is exactly
 * the bug this used to have.
 */
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
  const [latest, setLatest] = useState<Taken | null>(null);

  useRealtime(
    { unitId },
    useCallback(
      (event: RealtimeEvent) => {
        if (!isAvailabilityEvent(event) || event.unitId !== unitId) return;

        const from = Date.parse(event.checkInUtc);
        const to = Date.parse(event.checkOutUtc);
        if (Number.isNaN(from) || Number.isNaN(to)) return;

        setLatest({
          from,
          to,
          freed: event.type === 'INVENTORY_RELEASED',
        });
      },
      [unitId],
    ),
  );

  if (!latest) return null;

  const wantFrom = parseLocalInput(checkIn);
  const wantTo = parseLocalInput(checkOut);
  if (Number.isNaN(wantFrom) || Number.isNaN(wantTo)) return null;

  // Only speak up about the window this reader actually wants. Chatter about
  // unrelated times on the same unit is noise they cannot act on.
  if (!overlaps(wantFrom, wantTo, latest.from, latest.to)) return null;

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
