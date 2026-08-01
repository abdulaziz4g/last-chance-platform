import type { Metadata } from 'next';
import Link from 'next/link';
import { GuestHeader } from '@/components/guest-header';
import { MapExplorer } from '@/components/map/map-explorer';

export const metadata: Metadata = {
  title: 'Explore the map',
};

export default function MapPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      <GuestHeader area="Map">
        <Link
          href="/discover"
          className="text-sm whitespace-nowrap text-taupe-500 transition-colors hover:text-coral-500 dark:text-zinc-400 dark:hover:text-coral-400"
        >
          List view
        </Link>
        <Link
          href="/bookings"
          className="text-sm whitespace-nowrap text-taupe-500 transition-colors hover:text-coral-500 dark:text-zinc-400 dark:hover:text-coral-400"
        >
          My bookings
        </Link>
      </GuestHeader>

      <div className="pb-4">
        <h1 className="text-xl font-semibold">Stays around AlUla</h1>
        <p className="mt-1 text-sm text-taupe-500 dark:text-zinc-400">
          Pan the map to search this area. Gold pins are live flash deals.
        </p>
      </div>

      <MapExplorer />
    </div>
  );
}
