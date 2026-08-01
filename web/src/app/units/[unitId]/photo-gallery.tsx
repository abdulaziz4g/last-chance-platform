import Image from 'next/image';

/**
 * Listing photos. The first is the hero and gets priority, since it is
 * reliably the largest contentful paint on this page; the rest are lazy.
 *
 * Photos are proxied through /media (see next.config rewrites), so they are
 * same-origin as far as next/image is concerned and need no remotePatterns
 * allowlist. `sizes` is set from the actual layout so the optimiser does not
 * ship a desktop-width file to a phone.
 */
export function PhotoGallery({
  photos,
  alt,
}: {
  photos: string[];
  alt: string;
}) {
  if (photos.length === 0) {
    return (
      <div className="mb-8 flex h-40 items-center justify-center rounded-card border border-dashed border-zinc-200 text-xs text-zinc-400 dark:border-white/[0.08] dark:text-zinc-600">
        No photos yet
      </div>
    );
  }

  const [hero, ...rest] = photos;
  const secondary = rest.slice(0, 4);

  return (
    <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div
        className={`relative aspect-[4/3] overflow-hidden rounded-card bg-zinc-100 dark:bg-white/[0.04] ${
          secondary.length === 0 ? 'sm:col-span-2' : ''
        }`}
      >
        <Image
          src={hero}
          alt={alt}
          fill
          priority
          sizes="(max-width: 640px) 100vw, 50vw"
          className="object-cover"
        />
      </div>

      {secondary.length > 0 && (
        <div
          className={`grid gap-3 ${
            secondary.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {secondary.map((src, i) => (
            <div
              key={src}
              className="relative aspect-[4/3] overflow-hidden rounded-card bg-zinc-100 dark:bg-white/[0.04]"
            >
              <Image
                src={src}
                alt={`${alt} — photo ${i + 2}`}
                fill
                loading="lazy"
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
