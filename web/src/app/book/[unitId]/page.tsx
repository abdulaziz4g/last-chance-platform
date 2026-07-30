import Link from 'next/link';
import { GuestHeader } from '@/components/guest-header';
import { BookForm } from './book-form';

export default function BookPage() {
  return (
    <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
      <GuestHeader area="Book a stay">
        <Link
          href="/discover"
          className="text-sm whitespace-nowrap text-zinc-500 transition-colors hover:text-brass-500 dark:text-zinc-400 dark:hover:text-brass-400"
        >
          ← Back to search
        </Link>
      </GuestHeader>

      <BookForm />
    </main>
  );
}
