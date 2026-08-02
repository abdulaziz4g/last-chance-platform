import type { Metadata } from 'next';
import { GuestHeader } from '@/components/guest-header';
import { GuestNav, GuestNavSpacer } from '@/components/guest-nav';
import { MessageFilters } from './message-filters';

export const metadata: Metadata = { title: 'Messages' };

/**
 * Conversations with hosts and support.
 *
 * MOCK, and deliberately EMPTY rather than populated. There is no conversation
 * API, and a fabricated message from a host is the kind of placeholder that
 * gets screenshotted and mistaken for a working feature. The filter pills and
 * the empty state are real; the list behind them has nothing to list yet.
 */
export default function MessagesPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <GuestHeader area="Messages" />
      <GuestNav />

      <h1 className="mt-6 font-display text-4xl">Messages</h1>

      <MessageFilters />

      <GuestNavSpacer />
    </main>
  );
}
