import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Only discovery and listing pages belong in an index. Everything else is
 * either someone's private data (bookings, the booking funnel) or an operator
 * surface — and crawling a booking URL would be, at best, noise in the logs.
 *
 * These paths are already behind auth; this stops them being requested at all,
 * and keeps them out of search results if a URL ever leaks.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/discover', '/units/'],
        disallow: [
          '/admin',
          '/host',
          '/bookings',
          '/book/',
          '/deals/',
          '/login',
          '/register',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
