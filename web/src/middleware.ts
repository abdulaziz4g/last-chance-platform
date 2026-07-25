import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'lc_session';

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const seg = token.split('.')[1];
    return JSON.parse(Buffer.from(seg, 'base64url').toString());
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const claims = token ? decodePayload(token) : null;

  const isAuthenticated = !!claims;
  const actorType = (claims?.['actorType'] as string) ?? '';
  const role = (claims?.['role'] as string) ?? '';
  const isAdmin = role === 'ADMIN';

  if (pathname === '/login' || pathname === '/register') {
    if (isAuthenticated) {
      const dest = isAdmin ? '/admin' : actorType === 'HOST' ? '/host' : '/discover';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/bookings') || pathname.startsWith('/book/')) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/bookings') || pathname.startsWith('/book/')) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/host')) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (!isAdmin && actorType !== 'HOST') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/register', '/bookings', '/book/:path*', '/admin/:path*', '/host/:path*'],
};
