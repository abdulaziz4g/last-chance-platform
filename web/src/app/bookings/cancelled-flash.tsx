'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/toast';

/**
 * Announces a cancellation that completed on a previous render.
 *
 * This lives on the page rather than inside the cancel form because the form
 * is gone by the time the result is known — the revalidated list no longer
 * offers a cancel control for a cancelled booking. The flag is cleared from
 * the URL immediately so a refresh or a shared link does not replay it.
 */
export function CancelledFlash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const announced = useRef<string | null>(null);

  const code = params.get('cancelled');

  useEffect(() => {
    if (!code || announced.current === code) return;
    announced.current = code;
    toast(`Booking ${code} cancelled.`, 'success');
    router.replace(pathname, { scroll: false });
  }, [code, toast, router, pathname]);

  return null;
}
