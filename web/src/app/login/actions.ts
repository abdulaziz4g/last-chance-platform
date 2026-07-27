'use server';

import { redirect } from 'next/navigation';
import { clearSession, setSession } from '@/lib/session';
import { retryAfterFrom } from '@/lib/api';

const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:3000';

export interface AuthActionState {
  error?: string;
  /** Present only when throttled, so the form can hold itself shut. */
  retryAfterSec?: number;
}

export async function loginAction(
  _prev: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { error: 'Cannot reach the server. Check your connection.' };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-JSON error body */
    }

    // Being throttled says nothing about the credentials. Reporting them as
    // wrong sends the reader off to check a password that may be perfectly
    // correct — and to retry, which spends more of an exhausted budget.
    const retryAfterSec = retryAfterFrom(res, parsed);
    if (retryAfterSec) {
      return { error: 'Too many sign-in attempts.', retryAfterSec };
    }
    return { error: 'Invalid email or password.' };
  }

  const body = (await res.json()) as {
    accessToken: string;
    user: { actorType: string };
  };

  await setSession(body.accessToken);

  const dest =
    body.user.actorType === 'ADMIN'
      ? '/admin'
      : body.user.actorType === 'HOST'
        ? '/host'
        : '/discover';

  redirect(dest);
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}
