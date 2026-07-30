/** Stands in for `@/lib/session`. */

let session: { sub: string } | null = { sub: 'guest-1' };

export function setSession(next: { sub: string } | null): void {
  session = next;
}

export async function getSession(): Promise<{ sub: string } | null> {
  return session;
}
