import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { getSession } from '@/lib/session';
import { logoutAction } from '@/app/login/actions';

export const metadata: Metadata = {
  title: 'Operations',
  robots: { index: false, follow: false },
};

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/moderation', label: 'Listing review' },
  { href: '/admin/payments', label: 'Payments & webhooks' },
  { href: '/admin/ledger', label: 'Escrow ledger' },
  { href: '/host', label: '→ Host studio' },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  return (
    <Shell
      area="Operations"
      nav={NAV}
      userEmail={session?.email}
      logoutAction={logoutAction}
    >
      {children}
    </Shell>
  );
}
