/**
 * Absolute origin for canonical URLs, Open Graph tags, robots and the sitemap.
 * These must be absolute to be useful — a relative canonical is ignored by
 * crawlers, and a relative OG image does not render in a share card.
 *
 * Lives here rather than in the root layout because Next.js only permits a
 * known set of exports from a layout module.
 */
export const SITE_URL = (
  process.env.SITE_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');
