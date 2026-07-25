'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

export default function BookingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] bookings error', error);
  }, [error]);

  return (
    <ErrorState
      title="Could not load your bookings"
      description="Your reservations are safe — this is only the list view failing to load. Try again in a moment."
      reset={reset}
      digest={error.digest}
      homeHref="/discover"
      homeLabel="Browse stays"
    />
  );
}
