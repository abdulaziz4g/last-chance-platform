'use server';

import { redirect } from 'next/navigation';
import { setSession } from '@/lib/session';
import { retryAfterFrom } from '@/lib/api';
import type { AuthActionState } from '@/app/login/actions';

const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:3000';

export async function registerAction(
  _prev: AuthActionState | null,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const fullName = formData.get('fullName') as string;

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  if (password.length < 10) {
    return { error: 'Password must be at least 10 characters.' };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, fullName }),
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

    const retryAfterSec = retryAfterFrom(res, parsed);
    if (retryAfterSec) {
      return { error: 'Too many sign-up attempts.', retryAfterSec };
    }

    // The API nests its message under `error` — reading `message` alone threw
    // away the useful ones, so "that email is taken" arrived as a shrug.
    const msg = (parsed as { error?: { message?: string }; message?: string })
      ?.error?.message;
    return {
      error: msg ?? 'Registration failed. Please try again.',
    };
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
