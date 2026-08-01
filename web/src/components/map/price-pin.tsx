'use client';

import { formatPinPrice, type MapPin } from '@/lib/map-search';

/**
 * The price pin.
 *
 * Rendered as a React node rather than a canvas symbol so it inherits the
 * design system, stays legible at any device pixel ratio, and can be a real
 * button — a map whose only affordances are canvas hit-tests is unusable with
 * a keyboard or a screen reader.
 */
export function PricePin({
  pin,
  selected,
  onSelect,
}: {
  pin: MapPin;
  selected: boolean;
  onSelect: (unitId: string) => void;
}) {
  const hasDeal = pin.deal !== null;

  return (
    <button
      type="button"
      onClick={() => onSelect(pin.unitId)}
      aria-pressed={selected}
      aria-label={
        `${pin.propertyName}, ${pin.unitName}. ` +
        `${formatPinPrice(pin.priceMinor, pin.currency)} per ${
          pin.bookingType === 'HOURLY' ? 'hour' : 'night'
        }.` +
        (hasDeal ? ` Flash deal, ${pin.deal?.discountPct}% off.` : '')
      }
      className={[
        'relative inline-flex items-center gap-1 rounded-full px-2.5 py-1',
        'text-xs font-semibold tabular-nums shadow-md ring-1 transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        // Selected wins over deal styling: the user's own choice should be the
        // most prominent thing on the map, not the marketing.
        selected
          ? 'z-20 scale-110 bg-slate-deep-900 text-white ring-slate-deep-900'
          : hasDeal
            ? 'z-10 bg-sandgold-500 text-slate-deep-900 ring-sandgold-600'
            : 'bg-white text-slate-deep-900 ring-black/10 dark:bg-slate-deep-900 dark:text-white dark:ring-white/20',
        hasDeal && !selected ? 'lc-deal-pulse' : '',
      ].join(' ')}
    >
      {hasDeal ? (
        <span className="text-[10px] font-bold" aria-hidden="true">
          −{pin.deal?.discountPct}%
        </span>
      ) : null}
      <span>{formatPinPrice(pin.priceMinor, pin.currency)}</span>
    </button>
  );
}

/**
 * The preview card the carousel and the desktop list share, so a pin selected
 * on the map and a row read in the list describe the unit the same way.
 */
export function PinPreviewCard({
  pin,
  selected,
  onSelect,
}: {
  pin: MapPin;
  selected: boolean;
  onSelect: (unitId: string) => void;
}) {
  const perUnit = pin.bookingType === 'HOURLY' ? 'hour' : 'night';

  return (
    <a
      href={`/units/${pin.unitId}`}
      onMouseEnter={() => onSelect(pin.unitId)}
      onFocus={() => onSelect(pin.unitId)}
      className={[
        'block w-64 shrink-0 overflow-hidden rounded-xl border bg-white transition',
        'dark:bg-slate-deep-900',
        selected
          ? 'border-terracotta-500 ring-2 ring-terracotta-500/40'
          : 'border-black/10 hover:border-terracotta-300 dark:border-white/10',
      ].join(' ')}
    >
      <div className="relative h-32 w-full bg-sandgold-100 dark:bg-slate-deep-700">
        {pin.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pin.photos[0]}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="lc-nabataean h-full w-full" aria-hidden="true" />
        )}
        {pin.deal ? (
          <span className="absolute left-2 top-2 rounded-full bg-sandgold-500 px-2 py-0.5 text-[10px] font-bold text-slate-deep-900">
            −{pin.deal.discountPct}% flash deal
          </span>
        ) : null}
      </div>

      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium">{pin.propertyName}</p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {pin.unitName} · {pin.city}
          {pin.district ? `, ${pin.district}` : ''}
        </p>
        <p className="text-sm">
          {pin.deal ? (
            <span className="me-1 text-xs text-zinc-400 line-through">
              {formatPinPrice(pin.basePriceMinor, pin.currency)}
            </span>
          ) : null}
          <span className="font-semibold tabular-nums">
            {formatPinPrice(pin.priceMinor, pin.currency)}
          </span>
          <span className="text-xs text-zinc-500"> / {perUnit}</span>
        </p>
        {pin.ratingAvg !== null ? (
          <p className="text-xs text-zinc-500">
            ★ {pin.ratingAvg.toFixed(2)}{' '}
            <span className="text-zinc-400">({pin.ratingCount})</span>
          </p>
        ) : null}
      </div>
    </a>
  );
}
