import type { Map as MapboxMap } from 'mapbox-gl';

/**
 * AlUla desert theming, applied as paint overrides on top of a stock base
 * style rather than as a bespoke style published from Mapbox Studio.
 *
 * WHY THIS WAY: a Studio style is an account artefact — it lives under one
 * person's login, needs republishing to change, and cannot be reviewed in a
 * pull request. These overrides are code: they diff, they are commented, and
 * they work against whatever base style is configured. If a Studio style is
 * later preferred, point NEXT_PUBLIC_MAPBOX_STYLE at it and this becomes a
 * no-op — every override is guarded by a layer-exists check.
 *
 * The palette is the brand's, matched to globals.css so the map does not drift
 * from the rest of the interface.
 */

const SAND_LIGHT = '#f2e4d4';
const SAND_MID = '#e6d2bb';
const TERRACOTTA_ROAD = '#d99b7d';
const TERRACOTTA_DEEP = '#c86d51';
const WATER = '#9fb8bd';
const SLATE_TEXT = '#1e232a';

const SAND_LIGHT_DARK = '#2a2520';
const SAND_MID_DARK = '#332c25';
const ROAD_DARK = '#5c4133';
const WATER_DARK = '#1f2a2d';
const TEXT_DARK = '#e8dccd';

/**
 * Only the four colour properties this theme touches. Mapbox types
 * setPaintProperty against a union of every paint key in the spec; naming the
 * subset we use keeps that check meaningful instead of casting it away.
 */
type PaintColourProperty =
  | 'background-color'
  | 'fill-color'
  | 'line-color'
  | 'text-color';

interface PaintOverride {
  layer: string;
  property: PaintColourProperty;
  light: string;
  dark: string;
}

/**
 * Layer ids follow Mapbox's standard styles (streets/light/dark v11). Any that
 * a given style lacks are skipped silently — the alternative is a console full
 * of errors the moment someone swaps the base style.
 */
const OVERRIDES: PaintOverride[] = [
  { layer: 'land', property: 'background-color', light: SAND_LIGHT, dark: SAND_LIGHT_DARK },
  { layer: 'background', property: 'background-color', light: SAND_LIGHT, dark: SAND_LIGHT_DARK },
  { layer: 'landcover', property: 'fill-color', light: SAND_MID, dark: SAND_MID_DARK },
  { layer: 'national-park', property: 'fill-color', light: SAND_MID, dark: SAND_MID_DARK },
  { layer: 'landuse', property: 'fill-color', light: SAND_MID, dark: SAND_MID_DARK },
  { layer: 'water', property: 'fill-color', light: WATER, dark: WATER_DARK },
  { layer: 'waterway', property: 'line-color', light: WATER, dark: WATER_DARK },
  { layer: 'road-simple', property: 'line-color', light: TERRACOTTA_ROAD, dark: ROAD_DARK },
  { layer: 'road-street', property: 'line-color', light: TERRACOTTA_ROAD, dark: ROAD_DARK },
  { layer: 'road-secondary-tertiary', property: 'line-color', light: TERRACOTTA_ROAD, dark: ROAD_DARK },
  { layer: 'road-primary', property: 'line-color', light: TERRACOTTA_DEEP, dark: ROAD_DARK },
  { layer: 'road-motorway-trunk', property: 'line-color', light: TERRACOTTA_DEEP, dark: ROAD_DARK },
  { layer: 'building', property: 'fill-color', light: '#dcc3a8', dark: '#3a322a' },
  { layer: 'settlement-major-label', property: 'text-color', light: SLATE_TEXT, dark: TEXT_DARK },
  { layer: 'settlement-minor-label', property: 'text-color', light: SLATE_TEXT, dark: TEXT_DARK },
  { layer: 'road-label', property: 'text-color', light: '#6b5240', dark: '#a08a72' },
];

export function applyAlUlaTheme(map: MapboxMap, dark: boolean): void {
  const style = map.getStyle();
  if (!style) return;
  const present = new Set(style.layers?.map((l) => l.id) ?? []);

  for (const o of OVERRIDES) {
    if (!present.has(o.layer)) continue;
    try {
      map.setPaintProperty(o.layer, o.property, dark ? o.dark : o.light);
    } catch {
      // A layer whose paint property differs in this style — skip rather than
      // take the whole map down for a cosmetic mismatch.
    }
  }
}

/** Base style; overridden per environment when a Studio style is available. */
export const BASE_STYLE =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? 'mapbox://styles/mapbox/light-v11';

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
