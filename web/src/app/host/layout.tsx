import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { getSession } from '@/lib/session';
import { logoutAction } from '@/app/login/actions';

const NAV = [
  { href: '/host', label: 'Overview' },
  { href: '/host/bookings', label: 'Bookings' },
  { href: '/host/deals', label: 'Flash deals' },
  { href: '/admin', label: '→ Operations console' },
];

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
