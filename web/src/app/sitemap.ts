import type { MetadataRoute } from 'next';
import { searchUnitsPublic, SEARCH_MAX_PAGE_SIZE } from '@/lib/api';
import { SITE_URL } from '@/lib/site';

/**
 * Upper bound on listings we will enumerate. Sitemaps are capped at 50k URLs
 * by the protocol; this is well under that and keeps generation quick. Beyond
 * this the sitemap wants splitting into an index of several files.
 */
const MAX_UNITS = 5000;

export const revalidate = 3600;

/**
 * Static entries plus every listing the search index knows about.
 *
 * Paged rather than fetched in one go: the search API caps pageSize, and
 * asking for more is a 400 — which, swallowed by the guard below, produced a
 * sitemap that silently listed nothing at all.
 *
 * A search outage must not take the sitemap down with it either; a 500 here
 * teaches crawlers to back off. The static routes are always emitted, and
 * whatever listings were collected before a failure are kept.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/discover`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ];

  const unitIds: string[] = [];
  try {
    for (let page = 1; unitIds.length < MAX_UNITS; page++) {
      const results = await searchUnitsPublic({
        page,
        pageSize: SEARCH_MAX_PAGE_SIZE,
      });
      unitIds.push(...results.items.map((u) => u.unitId));

      if (
        results.items.length < SEARCH_MAX_PAGE_SIZE ||
        unitIds.length >= results.total
      ) {
        break;
      }
    }
  } catch {
    /* keep whatever was collected before the failure */
  }

  return [
    ...staticRoutes,
    ...unitIds.slice(0, MAX_UNITS).map((unitId) => ({
      url: `${SITE_URL}/units/${unitId}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];
}
