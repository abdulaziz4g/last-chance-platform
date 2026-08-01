import type { MapBounds } from '@/lib/map-search';

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Web Mercator, normalised to the unit square. Shared by the live map and the
 * token-less fallback so both place a marker at the same relative spot — the
 * fallback is a degraded backdrop, not a different geometry.
 */
export function mercator(lng: number, lat: number): ScreenPoint {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clampedLat * Math.PI) / 180;
  return {
    x: (lng + 180) / 360,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2,
  };
}

/** Projects a coordinate into pixels within a container fitted to `bounds`. */
export function projectInto(
  lng: number,
  lat: number,
  bounds: MapBounds,
  width: number,
  height: number,
): ScreenPoint {
  const min = mercator(bounds.minLng, bounds.maxLat); // top-left
  const max = mercator(bounds.maxLng, bounds.minLat); // bottom-right
  const p = mercator(lng, lat);
  const spanX = max.x - min.x || 1;
  const spanY = max.y - min.y || 1;
  return {
    x: ((p.x - min.x) / spanX) * width,
    y: ((p.y - min.y) / spanY) * height,
  };
}

/**
 * Ground resolution at a given latitude and zoom. Needed to draw the privacy
 * circle at its true 500 m radius rather than a fixed pixel size that would
 * silently imply more or less precision as the user zooms.
 */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Approximate zoom for a bounds fitted to a container of `width` pixels. */
export function zoomForBounds(bounds: MapBounds, width: number): number {
  const min = mercator(bounds.minLng, bounds.maxLat);
  const max = mercator(bounds.maxLng, bounds.minLat);
  const span = Math.abs(max.x - min.x) || 1e-6;
  // 256 px per world tile at zoom 0.
  return Math.log2(width / (256 * span));
}
