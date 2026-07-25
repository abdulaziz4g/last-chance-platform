'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

export default function HostError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[lc] host studio error', error);
  }, [error]);

  return (
    <ErrorState
      title="The studio could not load"
      description="We could not read your units and earnings just now. Your listings stay bookable while this view is down."
      reset={reset}
      digest={error.digest}
      homeHref="/host"
      homeLabel="Reload studio"
    />
  );
}
