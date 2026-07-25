import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { getSession } from '@/lib/session';
import { logoutAction } from '@/app/login/actions';

const NAV = [
  { href: '/host', label: 'Overview' },
  { href: '/host/bookings', label: 'Bookings' },
  { href: '/host/units', label: 'Units' },
  { href: '/host/deals', label: 'Flash deals' },
  { href: '/admin', label: '→ Operations console' },
];

export const metadata: Metadata = {
  title: 'Host studio',
  robots: { index: false, follow: false },
};

export default async function HostLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  return (
    <Shell
      area="Host studio"
      nav={NAV}
      userEmail={session?.email}
      logoutAction={logoutAction}
    >
      {children}
    </Shell>
  );
}
