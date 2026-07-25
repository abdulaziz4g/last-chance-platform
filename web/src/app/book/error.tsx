'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

/**
 * Covers the whole booking funnel — hold, payment and confirmation. Money is
 * involved, so the copy must not imply a charge was or was not made.
 */
export default function BookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] booking flow error', error);
  }, [error]);

  return (
    <ErrorState
      title="This step could not be completed"
      description="Nothing was submitted twice — check My bookings to see the current state of this reservation before retrying."
      reset={reset}
      digest={error.digest}
      homeHref="/bookings"
      homeLabel="My bookings"
    />
  );
}
