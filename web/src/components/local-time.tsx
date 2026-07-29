'use client';

import { useEffect, useState } from 'react';
import { timeWindow, timeWindowLocal } from '@/lib/format';

/**
 * A booking window in the viewer's own zone.
 *
 * The pages that show these are server components, and the server has no idea
 * what zone the viewer is in — so the first paint is the canonical UTC form and
 * the local form swaps in once mounted. Initial client render matches the
 * server's, so there is no hydration mismatch to suppress.
 *
 * Guest-facing screens use this. Admin and host tables deliberately do not:
 * staff compare rows across records, and one fixed zone is easier to reason
 * about there than each viewer seeing their own.
 */
export function LocalTimeWindow({
  fromIso,
  toIso,
}: {
  fromIso: string;
  toIso: string;
}) {
  const [text, setText] = useState(() => timeWindow(fromIso, toIso));

  useEffect(() => {
    setText(timeWindowLocal(fromIso, toIso));
  }, [fromIso, toIso]);

  return <>{text}</>;
}
