'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

/**
 * Catch-all for render errors below the root layout. Segment-level boundaries
 * handle their own copy; this is the backstop.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] unhandled render error', error);
  }, [error]);

  return <ErrorState reset={reset} digest={error.digest} />;
}
