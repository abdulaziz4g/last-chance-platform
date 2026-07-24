import { cookies } from 'next/headers';

const COOKIE_NAME = 'lc_session';

export interface Session {
  token: string;
  sub: string;
  email: string;
  actorType: 'GUEST' | 'HOST' | 'ADMIN';
  role: 'USER' | 'ADMIN';
}

function decodePayload(token: string): Record<string, unknown> {
  const seg = token.split('.')[1];
  return JSON.parse(Buffer.from(seg, 'base64url').toString());
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  try {
    const p = decodePayload(cookie.value);
    return {
      token: cookie.value,
      sub: p['sub'] as string,
      email: (p['email'] as string) ?? '',
      actorType: (p['actorType'] as Session['actorType']) ?? 'GUEST',
      role: (p['role'] as Session['role']) ?? 'USER',
    };
  } catch {
    return null;
  }
}

export async function setSession(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
