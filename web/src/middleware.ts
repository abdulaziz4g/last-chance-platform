import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'lc_session';

/**
 * Reads the claims without verifying the signature — the API does that. The
 * expiry check matters here regardless: an expired token still decodes, and
 * treating it as a live session sends the reader to a page whose every fetch
 * 401s, which surfaces as a generic error instead of "please sign in again".
 */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const seg = token.split('.')[1];
    const claims = JSON.parse(Buffer.from(seg, 'base64url').toString());
    const exp = claims?.exp;
    if (typeof exp === 'number' && exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const claims = token ? decodePayload(token) : null;

  // A cookie that no longer yields usable claims is stale; drop it so the
  // reader is not bounced between guards by a session that cannot work.
  const staleCookie = !!token && !claims;

  const isAuthenticated = !!claims;
  const actorType = (claims?.['actorType'] as string) ?? '';
  const role = (claims?.['role'] as string) ?? '';
  const isAdmin = role === 'ADMIN';

  /** Where this actor belongs when they land somewhere they should not be. */
  const home = isAdmin ? '/admin' : actorType === 'HOST' ? '/host' : '/discover';

  const goTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    if (staleCookie) res.cookies.delete(COOKIE_NAME);
    return res;
  };

  const proceed = () => {
    const res = NextResponse.next();
    if (staleCookie) res.cookies.delete(COOKIE_NAME);
    return res;
  };

  if (pathname === '/login' || pathname === '/register') {
    return isAuthenticated ? goTo(home) : proceed();
  }

  if (pathname.startsWith('/bookings') || pathname.startsWith('/book/')) {
    return isAuthenticated ? proceed() : goTo('/login');
  }

  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) return goTo('/login');
    // Signed in but not an operator: send them where they do belong rather
    // than to a sign-in form they would only be bounced away from again.
    return isAdmin ? proceed() : goTo(home);
  }

  if (pathname.startsWith('/host')) {
    if (!isAuthenticated) return goTo('/login');
    return isAdmin || actorType === 'HOST' ? proceed() : goTo(home);
  }

  return proceed();
}

export const config = {
  matcher: ['/login', '/register', '/bookings', '/book/:path*', '/admin/:path*', '/host/:path*'],
};
