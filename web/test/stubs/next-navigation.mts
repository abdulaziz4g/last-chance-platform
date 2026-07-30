/**
 * Stands in for `next/navigation`.
 *
 * The real `redirect()` signals by throwing, and the actions rely on that to
 * end control flow, so the stub throws too — a stub that returned normally
 * would let code run that never runs in production.
 */

export class RedirectSignal extends Error {
  // Assigned in the body rather than declared as a parameter property: Node's
  // strip-only type removal cannot rewrite those.
  url: string;

  constructor(url: string) {
    super(`redirect: ${url}`);
    this.name = 'RedirectSignal';
    this.url = url;
  }
}

export function redirect(url: string): never {
  throw new RedirectSignal(url);
}
