/**
 * The decision behind the availability warning: which incoming events matter,
 * and whether one collides with the window a reader is filling in.
 *
 * Kept apart from the component so it can be tested directly — this logic was
 * wrong once in a way that looked right on screen (it compared the form's wall
 * clock against the events' UTC), and a passing eyeball check is exactly what
 * failed to catch it.
 */

import { isAvailabilityEvent, type RealtimeEvent } from '@/lib/realtime';
import { parseLocalInput } from '@/lib/local-time';

export interface TakenWindow {
  from: number;
  to: number;
  freed: boolean;
}

/** Half-open overlap: touching end-to-start is not a clash. */
export const overlaps = (
  aFrom: number,
  aTo: number,
  bFrom: number,
  bTo: number,
): boolean => aFrom < bTo && bFrom < aTo;

/**
 * The window an event describes, or `null` if it is none of this unit's
 * business — a different unit, a deal event, or unparseable times.
 */
export function windowFromEvent(
  event: RealtimeEvent,
  unitId: string,
): TakenWindow | null {
  if (!isAvailabilityEvent(event) || event.unitId !== unitId) return null;

  const from = Date.parse(event.checkInUtc);
  const to = Date.parse(event.checkOutUtc);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;

  return { from, to, freed: event.type === 'INVENTORY_RELEASED' };
}

/**
 * Whether a taken (or freed) window is worth telling this reader about.
 *
 * Both sides must be real instants. The form fields carry the guest's wall
 * clock, so they are read in the guest's zone — the same conversion the form
 * itself does on submit. Reading them as UTC here is what made the warning
 * fire on windows that did not actually clash.
 */
export function affectsForm(
  latest: TakenWindow,
  checkIn: string,
  checkOut: string,
): boolean {
  const wantFrom = parseLocalInput(checkIn);
  const wantTo = parseLocalInput(checkOut);
  if (Number.isNaN(wantFrom) || Number.isNaN(wantTo)) return false;

  return overlaps(wantFrom, wantTo, latest.from, latest.to);
}
