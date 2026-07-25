'use server';

import { redirect } from 'next/navigation';
import { setSession } from '@/lib/session';

const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:3000';

export async function registerAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
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

  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, fullName }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.message ?? 'Registration failed. Please try again.';
    return { error: typeof msg === 'string' ? msg : 'Registration failed.' };
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
