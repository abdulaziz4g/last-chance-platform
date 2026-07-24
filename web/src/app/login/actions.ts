'use server';

import { redirect } from 'next/navigation';
import { clearSession, setSession } from '@/lib/session';

const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:3000';

export async function loginAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
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
