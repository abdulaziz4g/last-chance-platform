'use client';

import { useEffect, useState } from 'react';

/** Ticks the remaining deal window down from the server-rendered end time. */
export function DealCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const seconds = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000));
  if (seconds <= 0) return <span>ended</span>;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return (
    <span className="tnum font-medium text-rose-500">
      {h > 0
        ? `${h}h ${m}m ${String(s).padStart(2, '0')}s left`
        : `${m}:${String(s).padStart(2, '0')} left`}
    </span>
  );
}
