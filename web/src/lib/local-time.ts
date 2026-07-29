/**
 * Conversions between `datetime-local` form values and UTC instants.
 *
 * A `datetime-local` value ("2026-08-05T10:00") carries no zone. Passing one
 * to `new Date()` resolves it against *whatever machine is running the code*.
 * In a server action that is the server's zone, not the guest's — so the same
 * keystrokes booked a different hour in dev (Asia/Riyadh) than they would in a
 * UTC container. These helpers exist so that conversion only ever happens
 * where the guest's zone is actually known: their browser.
 *
 * Every function here therefore refuses to run on the server. That is
 * deliberate: a loud throw during development beats a booking that is politely
 * three hours wrong.
 */

function assertBrowser(fn: string): void {
  if (typeof window === 'undefined') {
    throw new Error(
      `${fn}() resolves a zoneless time against the runtime's zone, so it is ` +
        `only correct in the browser. Convert to a UTC instant before the ` +
        `value reaches a server action.`,
    );
  }
}

/** Epoch ms for a `datetime-local` value, read in the guest's zone. */
export function parseLocalInput(value: string): number {
  assertBrowser('parseLocalInput');
  return value ? new Date(value).getTime() : Number.NaN;
}

/**
 * A `datetime-local` value as a UTC ISO instant, or `null` if unparseable.
 * This is the only supported way to get a form time to the server.
 */
export function localInputToIso(value: string): string | null {
  assertBrowser('localInputToIso');
  const ms = parseLocalInput(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Formats an instant back into a `datetime-local` value in the guest's zone. */
export function isoToLocalInput(ms: number): string {
  assertBrowser('isoToLocalInput');
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Seed value: `daysAhead` days from now at `hour`:00 in the guest's zone. */
export function localInputAtHour(daysAhead: number, hour: number): string {
  assertBrowser('localInputAtHour');
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return isoToLocalInput(d.getTime());
}

/** Seed value: `hours` from now, rounded down to the hour, in the local zone. */
export function localInputInHours(hours: number): string {
  assertBrowser('localInputInHours');
  const d = new Date();
  d.setHours(d.getHours() + hours, 0, 0, 0);
  return isoToLocalInput(d.getTime());
}

/** The guest's IANA zone, for labelling times we show them. */
export function guestTimeZone(): string {
  assertBrowser('guestTimeZone');
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * True for a full ISO 8601 instant carrying an explicit offset — the only time
 * format allowed to cross into a server action.
 *
 * Unlike everything above, this is zone-independent and therefore safe to call
 * on the server; that is the whole point of making it the wire contract.
 */
export function isInstant(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) && !Number.isNaN(Date.parse(value))
  );
}
