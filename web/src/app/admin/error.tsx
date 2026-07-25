'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] admin console error', error);
  }, [error]);

  return (
    <ErrorState
      title="Reporting is unavailable"
      description="The console could not read platform state. This affects the dashboard only — bookings, payments and payouts continue to process."
      reset={reset}
      digest={error.digest}
      homeHref="/admin"
      homeLabel="Reload console"
    />
  );
}
