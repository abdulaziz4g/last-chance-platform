/**
 * Stands in for `@/lib/api`, recording what the actions actually put on the
 * wire. The recorded body is the subject of most assertions: the bug these
 * tests exist for was a value being altered on its way through.
 */

export interface RecordedCall {
  path: string;
  body: Record<string, unknown>;
}

export const calls: RecordedCall[] = [];

let nextResult: unknown = null;
let paymentProvider = 'MOCK';

export function reset(): void {
  calls.length = 0;
  nextResult = null;
  paymentProvider = 'MOCK';
}

/** Queue what the next `apiPostSafe` returns. Defaults to a successful hold. */
export function setNextResult(result: unknown): void {
  nextResult = result;
}

export function setPaymentProvider(provider: string): void {
  paymentProvider = provider;
}

/** The single call the actions make. */
export async function apiPostSafe(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  calls.push({ path, body });
  return (
    nextResult ?? {
      ok: true,
      data: { id: 'booking-1', unitId: 'unit-1' },
    }
  );
}

export async function getPaymentConfig(): Promise<{ provider: string }> {
  return { provider: paymentProvider };
}
