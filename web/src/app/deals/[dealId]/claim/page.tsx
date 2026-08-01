import Link from 'next/link';
import { GuestHeader } from '@/components/guest-header';
import { ClaimDealForm } from './claim-form';

export default function ClaimDealPage() {
  return (
    <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
      <GuestHeader area="Claim flash deal">
        <Link
          href="/discover"
          className="text-sm whitespace-nowrap text-taupe-500 transition-colors hover:text-coral-500 dark:text-zinc-400 dark:hover:text-coral-400"
        >
          ← Back to search
        </Link>
      </GuestHeader>

      <ClaimDealForm />
    </main>
  );
}
