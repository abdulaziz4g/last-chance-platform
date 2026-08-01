'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapBounds, MapPin } from '@/lib/map-search';
import { PricePin } from './price-pin';
import {
  metresPerPixel,
  projectInto,
  zoomForBounds,
  type ScreenPoint,
} from './projection';
import { applyAlUlaTheme, BASE_STYLE, MAPBOX_TOKEN } from './alula-style';

export interface MapCanvasProps {
  pins: MapPin[];
  bounds: MapBounds;
  selectedUnitId: string | null;
  onSelect: (unitId: string | null) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  loading?: boolean;
}

interface Placement {
  pin: MapPin;
  point: ScreenPoint;
  /** The unfanned projection — where the privacy circle is centred. */
  privacyCentre: ScreenPoint;
  privacyRadiusPx: number;
}

/**
 * The map surface.
 *
 * Markers are React nodes in an overlay, positioned by projecting each
 * coordinate to pixels — NOT Mapbox Marker instances. That buys three things
 * worth more than the convenience: the pins inherit the design system, they
 * are real focusable buttons rather than canvas hit-tests, and the exact same
 * marker code drives the no-token fallback below.
 *
 * WITHOUT A TOKEN the component does not render a broken grey box or silently
 * show nothing. It draws the same pins over a plain themed field, labelled as
 * degraded. Every behaviour except tiles — selection, projection, the privacy
 * circle, the carousel sync — remains exercisable, which is what makes the
 * feature reviewable before anyone has an account.
 */
export function MapCanvas({
  pins,
  bounds,
  selectedUnitId,
  onSelect,
  onBoundsChange,
  loading = false,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Bumped on every camera change so placements recompute; the map object
  // itself is mutable and would not trigger a render.
  const [cameraVersion, setCameraVersion] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const hasToken = MAPBOX_TOKEN.length > 0;

  // Keep the latest callback without making the map effect depend on it —
  // re-creating the map on every parent render would be catastrophic.
  const boundsChangeRef = useRef(onBoundsChange);
  boundsChangeRef.current = onBoundsChange;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Measure SYNCHRONOUSLY before paint, then observe for later changes.
    // ResizeObserver alone is not enough: its first callback is delivered on
    // the rendering lifecycle, so anything that defers or suspends rendering
    // (a background tab, a non-compositing embed, some headless setups) leaves
    // the map with zero size and therefore no markers, indefinitely. A
    // getBoundingClientRect on mount removes that dependency entirely.
    const measure = (): void => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Belt to the observer's braces for the same reason.
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // ---- live map ------------------------------------------------------------
  useEffect(() => {
    if (!hasToken || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    // Dynamic import: mapbox-gl is large and references `window` at module
    // scope, so it must never be pulled into the server bundle.
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: BASE_STYLE,
        bounds: [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        attributionControl: true,
      });
      mapRef.current = map;

      map.on('style.load', () => {
        applyAlUlaTheme(
          map,
          document.documentElement.classList.contains('dark'),
        );
      });
      map.on('load', () => {
        if (!cancelled) setMapReady(true);
      });
      map.on('move', () => setCameraVersion((v) => v + 1));
      map.on('moveend', () => {
        const b = map.getBounds();
        if (!b) return;
        boundsChangeRef.current({
          minLng: b.getWest(),
          minLat: b.getSouth(),
          maxLng: b.getEast(),
          maxLat: b.getNorth(),
        });
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Intentionally once: the map owns its camera after creation, and
    // re-running on a bounds prop change would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  const project = useCallback(
    (lng: number, lat: number): ScreenPoint => {
      const map = mapRef.current;
      if (map && mapReady) {
        const p = map.project([lng, lat]);
        return { x: p.x, y: p.y };
      }
      return projectInto(lng, lat, bounds, size.width, size.height);
    },
    [bounds, size.width, size.height, mapReady],
  );

  const placements = useMemo<Placement[]>(() => {
    if (size.width === 0 || size.height === 0) return [];
    const map = mapRef.current;
    const zoom =
      map && mapReady ? map.getZoom() : zoomForBounds(bounds, size.width);

    // Units of one property share its coordinates exactly — the approximate
    // location is per PROPERTY — so their pins would stack pixel-perfect and
    // all but the top one would be unclickable. Fan co-located pins out around
    // a small circle instead. The order is stable (index within the group), so
    // a pin does not jump to a different spot between renders.
    //
    // A single pin per property showing a "from" price is the better long-term
    // treatment; this keeps every unit individually selectable in the meantime.
    const byCoord = new Map<string, number>();
    const FAN_RADIUS_PX = 22;

    return pins.map((pin) => {
      const mpp = metresPerPixel(pin.approxLat, zoom);
      const base = project(pin.approxLng, pin.approxLat);
      const key = `${pin.approxLng.toFixed(6)},${pin.approxLat.toFixed(6)}`;
      const seen = byCoord.get(key) ?? 0;
      byCoord.set(key, seen + 1);

      const point =
        seen === 0
          ? base
          : (() => {
              // Distribute around the original point; the first pin stays put
              // so the marker over the true centre is the one that does not move.
              const angle = (seen * 2 * Math.PI) / 6 - Math.PI / 2;
              return {
                x: base.x + Math.cos(angle) * FAN_RADIUS_PX,
                y: base.y + Math.sin(angle) * FAN_RADIUS_PX,
              };
            })();

      return {
        pin,
        point,
        // The circle communicates a real distance, so it is sized from the
        // radius the API published, not a constant. Anchored on the true
        // projected point, never the fanned-out one.
        privacyCentre: base,
        privacyRadiusPx: mpp > 0 ? pin.privacyRadiusMetres / mpp : 0,
      };
    });
    // cameraVersion is the dependency that matters for a live map: it changes
    // on every frame of a pan, and project() reads mutable map state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, project, size.width, size.height, cameraVersion, mapReady, bounds]);

  const visible = placements.filter(
    (p) =>
      p.point.x >= -80 &&
      p.point.y >= -80 &&
      p.point.x <= size.width + 80 &&
      p.point.y <= size.height + 80,
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Mapbox mounts here; without a token it stays an empty themed field. */}
      <div
        ref={containerRef}
        className={
          hasToken
            ? 'absolute inset-0'
            : 'lc-nabataean absolute inset-0 bg-sand-100 dark:bg-ink-950'
        }
      />

      {/* Marker overlay. pointer-events-none so panning the map underneath
          still works; each pin re-enables them for itself. */}
      <div className="pointer-events-none absolute inset-0">
        {visible.map(({ pin, point, privacyCentre, privacyRadiusPx }) => {
          const isSelected = pin.unitId === selectedUnitId;
          return (
            <div key={pin.unitId}>
              {/* Privacy circle: the guest is told the area, never the address,
                  until a booking is confirmed. Drawn only for the selected pin
                  so the map is not a field of overlapping discs. */}
              {isSelected && privacyRadiusPx > 4 ? (
                <div
                  aria-hidden="true"
                  className="absolute rounded-full border-2 border-coral-500/60 bg-coral-500/15"
                  style={{
                    left: privacyCentre.x - privacyRadiusPx,
                    top: privacyCentre.y - privacyRadiusPx,
                    width: privacyRadiusPx * 2,
                    height: privacyRadiusPx * 2,
                  }}
                />
              ) : null}
              <div
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: point.x, top: point.y }}
              >
                <PricePin
                  pin={pin}
                  selected={isSelected}
                  onSelect={(id) => onSelect(id === selectedUnitId ? null : id)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {!hasToken ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink-900/85 px-3 py-2 text-center text-[11px] text-sand-200">
          Map tiles need a Mapbox token — set{' '}
          <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code>. Pins,
          pricing and the privacy radius are live.
        </div>
      ) : null}

      {loading ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium shadow dark:bg-ink-900/90">
          Searching…
        </div>
      ) : null}
    </div>
  );
}
