'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from './toast';

/**
 * Announces an action that completed on a previous render.
 *
 * Lifecycle actions change which controls a row offers, so the control that
 * submitted is usually gone by the time the result is known — it cannot
 * announce itself. The outcome travels back in the URL instead, and this,
 * mounted on the page, speaks for it.
 *
 * The URL carries a KEY, never the message. Anyone can craft a link to this
 * page, and rendering arbitrary text from a query string as a success banner
 * is a phishing primitive. Keys map to copy we wrote; the booking code is
 * shape-checked before it is shown.
 */

const MESSAGES: Record<string, (code: string) => string> = {
  cancelled: (code) => `Booking ${code} cancelled.`,
  'checked-in': (code) => `${code} checked in.`,
  completed: (code) => `${code} completed — payout queued.`,
};

/** LC-YYMMDD-XXXXXXXX, as minted by the booking service. */
const BOOKING_CODE = /^LC-\d{6}-[A-Z0-9]{8}$/;

export const FLASH_KEYS = Object.keys(MESSAGES);

export function ActionFlash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const announced = useRef<string | null>(null);

  const key = params.get('done');
  const code = params.get('code') ?? '';

  useEffect(() => {
    if (!key) return;

    const token = `${key}:${code}`;
    if (announced.current === token) return;
    announced.current = token;

    const build = MESSAGES[key];
    // Unknown key or a code that is not one of ours: drop it silently and
    // clean the URL rather than echoing whatever was handed to us.
    if (build && BOOKING_CODE.test(code)) {
      toast(build(code), 'success');
    }

    // Strip only the flash keys — anything else in the query string is the
    // reader's state (which page they were on, what they filtered by) and
    // dropping it would move them somewhere they did not ask to go.
    const rest = new URLSearchParams(params.toString());
    rest.delete('done');
    rest.delete('code');
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [key, code, params, toast, router, pathname]);

  return null;
}
