import { fetchModerationDocument } from '@/lib/api';

/**
 * Same-origin proxy for regulatory documents.
 *
 * The browser cannot call the API's admin route directly — it has no session
 * token to attach — so this hands the request to the backend with the server's
 * credentials and pipes the bytes back. The document never becomes a public
 * URL at any point: both hops are authenticated.
 *
 * Streams rather than buffers; a title deed scan can be tens of megabytes and
 * there is no reason for it to sit in this process's heap.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ propertyId: string; documentId: string }> },
): Promise<Response> {
  const { propertyId, documentId } = await context.params;
  const upstream = await fetchModerationDocument(propertyId, documentId);

  if (!upstream.ok || !upstream.body) {
    return new Response('Document not available', {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition':
        upstream.headers.get('content-disposition') ?? 'inline',
      // Mirrors the API: regulated paperwork must not linger in a cache.
      'cache-control': 'private, no-store',
      // These render inside an iframe on the inspection page; nothing else
      // should be able to frame them.
      'x-frame-options': 'SAMEORIGIN',
    },
  });
}
