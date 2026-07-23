import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/payments', label: 'Payments & webhooks' },
  { href: '/admin/ledger', label: 'Escrow ledger' },
  { href: '/host', label: '→ Host studio' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Shell area="Operations" nav={NAV}>
      {children}
    </Shell>
  );
}
