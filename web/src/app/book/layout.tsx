import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * The booking funnel is private and transient — a hold URL is meaningless to
 * anyone but its guest, and a payment page must never surface in a result.
 * robots.txt asks crawlers not to fetch these; this tells the ones that do
 * anyway not to index what they found.
 */
export const metadata: Metadata = {
  title: 'Booking',
  robots: { index: false, follow: false, nocache: true },
};

export default function BookLayout({ children }: { children: ReactNode }) {
  return children;
}
