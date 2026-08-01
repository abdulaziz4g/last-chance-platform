import { NextRequest } from 'next/server';

const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:3000';

/**
 * Same-origin proxy for viewport search.
 *
 * The map refetches on every pan, from the browser, so it cannot go through
 * the server-only api.ts. Proxying rather than calling the backend directly
 * keeps BACKEND_URL server-side (it is not necessarily reachable from a
 * visitor's network) and leaves one origin to configure for CSP.
 *
 * Query parameters are forwarded verbatim: the backend validates them, and a
 * second copy of that validation here would be one more thing to drift.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const search = request.nextUrl.search;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/units/map-search${search}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch {
    return Response.json(
      { error: { code: 'UPSTREAM_UNREACHABLE', message: 'Search is unavailable' } },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      // Results depend on live availability; a cached viewport would show
      // stays that are already booked.
      'cache-control': 'no-store',
    },
  });
}
