'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  boundsAreSearchable,
  fetchMapSearch,
  type BookingType,
  type MapBounds,
  type MapPin,
} from '@/lib/map-search';
import { MapCanvas } from './map-canvas';
import { PinPreviewCard } from './price-pin';

/**
 * The AlUla valley, the launch market: wide enough to take in Old Town, the
 * Hegra approach and Jabal AlFil at once, so the first view has inventory in
 * it rather than requiring a pan before anything appears.
 */
const DEFAULT_BOUNDS: MapBounds = {
  minLng: 37.85,
  minLat: 26.55,
  maxLng: 38.08,
  maxLat: 26.83,
};

/** A pan produces a bounds change per frame; only the last one is a search. */
const SEARCH_DEBOUNCE_MS = 400;

type View = 'map' | 'list';

export function MapExplorer({
  initialBookingType = 'NIGHTLY',
}: {
  initialBookingType?: BookingType;
}) {
  const [bounds, setBounds] = useState<MapBounds>(DEFAULT_BOUNDS);
  const [bookingType, setBookingType] = useState<BookingType>(initialBookingType);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('map');

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!boundsAreSearchable(bounds)) {
      setError('Zoom in to search this area.');
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      // Cancel the in-flight request: a fast pan otherwise races several
      // responses and the slowest one wins, painting stale pins.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      fetchMapSearch({ ...bounds, bookingType }, controller.signal)
        .then((result) => {
          setPins(result.pins);
          setTruncated(result.truncated);
          setError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError('Could not load stays for this area.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [bounds, bookingType]);

  // Selecting a pin scrolls its card into view. The carousel and the map are
  // two views of one selection, so neither may drift from the other.
  useEffect(() => {
    if (!selected || !carouselRef.current) return;
    const card = carouselRef.current.querySelector<HTMLElement>(
      `[data-unit-id="${selected}"]`,
    );
    card?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [selected]);

  const handleSelect = useCallback((unitId: string | null) => {
    setSelected(unitId);
  }, []);

  const selectedPin = pins.find((p) => p.unitId === selected) ?? null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <div
          className="inline-flex rounded-full border border-black/10 p-0.5 dark:border-white/15"
          role="group"
          aria-label="Stay type"
        >
          {(['NIGHTLY', 'HOURLY'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBookingType(t)}
              aria-pressed={bookingType === t}
              className={
                bookingType === t
                  ? 'rounded-full bg-terracotta-500 px-3 py-1 text-xs font-semibold text-white'
                  : 'rounded-full px-3 py-1 text-xs text-zinc-600 dark:text-zinc-300'
              }
            >
              {t === 'NIGHTLY' ? 'Nightly' : 'By the hour'}
            </button>
          ))}
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading
            ? 'Searching this area…'
            : `${pins.length} stay${pins.length === 1 ? '' : 's'} in view`}
          {truncated ? ' — zoom in to see them all' : ''}
        </p>

        {/* The list/map toggle is the mobile affordance; on wide screens both
            panes are visible at once and the control is redundant. */}
        <div className="ms-auto lg:hidden">
          <button
            type="button"
            onClick={() => setView(view === 'map' ? 'list' : 'map')}
            className="rounded-full bg-slate-deep-900 px-4 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-deep-900"
          >
            {view === 'map' ? 'Show list' : 'Show map'}
          </button>
        </div>
      </div>

      {error ? (
        <p
          role="status"
          className="mb-3 rounded-lg border border-terracotta-500/40 bg-terracotta-50 px-3 py-2 text-sm text-terracotta-900 dark:bg-terracotta-900/30 dark:text-terracotta-100"
        >
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Map pane */}
        <div
          className={[
            'relative min-h-0 overflow-hidden rounded-xl border border-black/10 dark:border-white/10',
            view === 'map' ? 'block' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          <MapCanvas
            pins={pins}
            bounds={bounds}
            selectedUnitId={selected}
            onSelect={handleSelect}
            onBoundsChange={setBounds}
            loading={loading}
          />

          {/* Mobile preview carousel, pinned over the map and synced to the
              selection. Hidden on desktop, where the side list serves. */}
          {pins.length > 0 ? (
            <div
              ref={carouselRef}
              className="absolute inset-x-0 bottom-0 flex gap-3 overflow-x-auto p-3 lg:hidden"
              aria-label="Stays in view"
            >
              {pins.map((pin) => (
                <div key={pin.unitId} data-unit-id={pin.unitId}>
                  <PinPreviewCard
                    pin={pin}
                    selected={pin.unitId === selected}
                    onSelect={handleSelect}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Desktop list pane */}
        <div
          className={[
            'min-h-0 space-y-3 overflow-y-auto',
            view === 'list' ? 'block' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          {pins.length === 0 && !loading ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No stays in this area yet. Try panning out.
            </p>
          ) : null}

          {pins.map((pin) => (
            <div key={pin.unitId} data-unit-id={pin.unitId} className="w-full">
              <div className="[&>a]:w-full">
                <PinPreviewCard
                  pin={pin}
                  selected={pin.unitId === selected}
                  onSelect={handleSelect}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedPin ? (
        <p className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Showing an approximate {selectedPin.privacyRadiusMetres} m area — the
          exact address is shared once your booking is confirmed.
        </p>
      ) : null}
    </div>
  );
}
