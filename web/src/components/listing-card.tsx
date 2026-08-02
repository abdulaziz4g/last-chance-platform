'use client';

import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/format';

/**
 * A listing tile: swipeable imagery, a save toggle, and the line of facts a
 * guest scans before clicking. The web twin of mobile's LcListingCard.
 *
 * Takes primitives rather than a domain object, so Explore can feed it map
 * results and Wishlists can feed it saved entries without either constructing
 * a fake of the other's model.
 *
 * Colours and radii come from the Tailwind theme, which is the design
 * package's transcription — no literal hexes here.
 */
export function ListingCard({
  href,
  title,
  subtitle,
  priceMinor,
  currency,
  photos = [],
  rating,
  perUnitLabel,
  badge,
  saved = false,
  onSavedChange,
}: {
  href: string;
  title: string;
  subtitle: string;
  priceMinor: number;
  currency: string;
  photos?: string[];
  rating?: number | null;
  perUnitLabel?: string;
  badge?: string;
  saved?: boolean;
  onSavedChange?: (saved: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const hasCarousel = photos.length > 1;

  return (
    <article className="group relative">
      <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-sand-200 dark:bg-white/[0.04]">
        {photos.length === 0 ? (
          <Placeholder />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- host photos
          // are arbitrary remote URLs; next/image would need every hostname
          // whitelisted in next.config, and a listing whose photo fails to
          // load should degrade to the placeholder rather than 500 the page.
          <img
            src={photos[index]}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        )}

        {hasCarousel && (
          <>
            <CarouselButton
              side="start"
              onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
            />
            <CarouselButton
              side="end"
              onClick={() => setIndex((i) => (i + 1) % photos.length)}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
              {photos.slice(0, 5).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-opacity ${
                    i === index ? 'bg-white' : 'bg-white/55'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => onSavedChange?.(!saved)}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved' : 'Save'}
          className="absolute end-2 top-2 rounded-full p-1.5 transition-transform active:scale-90"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-6 w-6 drop-shadow-[0_1px_3px_rgba(43,31,26,0.45)] ${
              saved ? 'fill-coral-500 stroke-coral-500' : 'fill-black/25 stroke-white'
            }`}
            strokeWidth="1.75"
            aria-hidden
          >
            <path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" strokeLinejoin="round" />
          </svg>
        </button>

        {badge && (
          <span className="absolute start-2.5 top-2.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-ink-900">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-2.5">
        <div className="flex items-baseline gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            <Link href={href} className="after:absolute after:inset-0">
              {title}
            </Link>
          </h3>
          {rating != null && (
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-star-500" aria-hidden>
                <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8Z" />
              </svg>
              {rating.toFixed(1)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-taupe-500 dark:text-zinc-400">
          {subtitle}
        </p>
        <p className="mt-1.5 text-[14px]">
          <span className="font-bold">{money(priceMinor, currency)}</span>
          {perUnitLabel && (
            <span className="text-taupe-500 dark:text-zinc-400"> {perUnitLabel}</span>
          )}
        </p>
      </div>
    </article>
  );
}

/**
 * Arrows appear on hover on a pointer device and are always present for
 * keyboard users, who have no hover to reveal them.
 */
function CarouselButton({
  side,
  onClick,
}: {
  side: 'start' | 'end';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'start' ? 'Previous photo' : 'Next photo'}
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${
        side === 'start' ? 'start-2' : 'end-2'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-ink-900" fill="none" strokeWidth="2" aria-hidden>
        <path
          d={side === 'start' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Sand with the doorway glyph — the monogram's own motif, not a broken box. */
function Placeholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg viewBox="0 0 24 24" className="h-9 w-9 stroke-taupe-500" fill="none" strokeWidth="1.5" aria-hidden>
        <path d="M6 21V7a6 6 0 0 1 12 0v14" strokeLinecap="round" />
        <path d="M4 21h16" strokeLinecap="round" />
        <circle cx="14.5" cy="13" r="0.9" className="fill-taupe-500 stroke-none" />
      </svg>
    </div>
  );
}
