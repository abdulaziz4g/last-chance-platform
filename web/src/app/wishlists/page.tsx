import type { Metadata } from 'next';
import { GuestHeader } from '@/components/guest-header';
import { GuestNav, GuestNavSpacer } from '@/components/guest-nav';

export const metadata: Metadata = { title: 'Wishlists' };

/**
 * Saved collections.
 *
 * MOCK. There is no wishlist API — the backend exposes zero endpoints for
 * saving a listing — so this renders demo collections and the hearts elsewhere
 * do not persist. Stated here so nobody spends an afternoon hunting for the
 * sync bug: the screen is real, the storage is not.
 */
const DEMO = [
  { id: 'recent', name: 'Recently viewed', savedCount: 4 },
  { id: 'alula', name: 'AlUla 2026', savedCount: 8 },
  { id: 'riyadh', name: 'Riyadh', savedCount: 3 },
  { id: 'seaview', name: 'Sea view', savedCount: 2 },
];

export default function WishlistsPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <GuestHeader area="Wishlists" />
      <GuestNav />

      <h1 className="mt-6 font-display text-4xl">Wishlists</h1>

      <ul className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {DEMO.map((list) => (
          <li key={list.id}>
            {/* Four-up mosaic. Empty slots stay sand rather than collapsing,
                so every tile is the same shape whether a collection holds one
                stay or twelve. */}
            <div className="grid aspect-square grid-cols-2 gap-0.5 overflow-hidden rounded-card">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-sand-200 dark:bg-white/[0.05]" />
              ))}
            </div>
            <p className="mt-2 truncate text-[15px] font-semibold">{list.name}</p>
            <p className="text-[13px] text-taupe-500 dark:text-zinc-400">
              {list.savedCount} saved
            </p>
          </li>
        ))}
      </ul>

      <GuestNavSpacer />
    </main>
  );
}
