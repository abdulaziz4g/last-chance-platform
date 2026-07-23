/** Presentation formatting — money is ALWAYS integer minor units in transit. */

export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

export function dateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }).format(new Date(iso));
}

export function timeWindow(fromIso: string, toIso: string): string {
  return `${dateTime(fromIso)} → ${dateTime(toIso)} UTC`;
}
