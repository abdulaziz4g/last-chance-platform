import type { MetadataRoute } from 'next';
import { searchUnits } from '@/lib/api';
import { SITE_URL } from '@/lib/site';

/** OpenSearch caps paging; one pass at this size covers a realistic catalogue. */
const MAX_UNITS = 500;

export const revalidate = 3600;

/**
 * Static entries plus every listing the search index knows about.
 *
 * A search outage must not take the sitemap down with it — a 500 here teaches
 * crawlers to back off. The static routes are always emitted, and listings are
 * added only if the query succeeds.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${SITE_URL}/discover`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ];

  try {
    const results = await searchUnits({ page: 1, pageSize: MAX_UNITS });
    return [
      ...staticRoutes,
      ...results.items.map((u) => ({
        url: `${SITE_URL}/units/${u.unitId}`,
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
