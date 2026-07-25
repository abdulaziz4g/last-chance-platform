'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

export default function UnitError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] unit detail error', error);
  }, [error]);

  return (
    <ErrorState
      title="This stay could not be loaded"
      description="The listing itself is fine — we just could not fetch its details. Try again, or go back and pick another."
      reset={reset}
      digest={error.digest}
      homeHref="/discover"
      homeLabel="Back to search"
    />
  );
}
