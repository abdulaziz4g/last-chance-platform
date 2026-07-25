'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] discover error', error);
  }, [error]);

  return (
    <ErrorState
      title="Search is unavailable"
      description="We could not reach the search index just now. Your filters are still in the address bar, so retrying should pick up where you left off."
      reset={reset}
      digest={error.digest}
      homeHref="/"
      homeLabel="Back to start"
    />
  );
}
