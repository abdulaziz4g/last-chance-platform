'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Feedback for a throttled caller.
 *
 * A bare "too many requests" is the worst of both worlds: it does not say how
 * long to wait, and it leaves the control live, so the natural response —
 * pressing again — spends more of a budget that is already exhausted. These
 * two pieces let a form say exactly when it will work again and stay shut
 * until then.
 */

/**
 * Counts a retry window down to zero, restarting whenever a new throttle
 * arrives.
 *
 * Keyed on the state object rather than the number: two 429s in a row can
 * legitimately report the same remaining seconds, and comparing values alone
 * would leave the first countdown running instead of restarting it.
 */
export function useRetryAfter(
  state: { retryAfterSec?: number } | null,
): number {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const seen = useRef<unknown>(null);

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    setSecondsLeft(state.retryAfterSec ?? 0);
  }, [state]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return secondsLeft;
}

/** "1:05" past a minute, plain seconds below it. */
function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RateLimitNotice({
  secondsLeft,
  action = 'try again',
}: {
  secondsLeft: number;
  /** What the reader was attempting, so the copy fits the form. */
  action?: string;
}) {
  if (secondsLeft <= 0) return null;

  return (
    <p
      // assertive: this contradicts what the reader just tried to do, and a
      // polite announcement could be queued behind other updates.
      role="alert"
      aria-live="assertive"
      className="rounded-lg bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300"
    >
      Too many attempts. You can {action} in{' '}
      <span className="tnum font-semibold">{formatWait(secondsLeft)}</span>.
    </p>
  );
}
