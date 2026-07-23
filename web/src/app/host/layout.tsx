import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/host', label: 'Overview' },
  { href: '/host/bookings', label: 'Bookings' },
  { href: '/admin', label: '→ Operations console' },
];

export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <Shell area="Host studio" nav={NAV}>
      {children}
    </Shell>
  );
}
