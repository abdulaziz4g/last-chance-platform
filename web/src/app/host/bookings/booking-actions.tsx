'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { checkInAction, completeAction, hostCancelAction } from './actions';
import { useActionToast } from '@/components/toast';

/**
 * Row-level lifecycle controls for a host's bookings.
 *
 * Steps that move money or cannot be undone ask twice; the confirmation
 * replaces the button in place rather than expanding a panel, because these
 * live inside a table row.
 */

const BTN =
  'rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors disabled:opacity-50';

function Pending({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-zinc-400">{children}</span>;
}

/** One-tap step: recording arrival moves no money. */
function CheckIn({ bookingId, page }: { bookingId: string; page: number }) {
  const [state, formAction, pending] = useActionState(checkInAction, null);
  useActionToast(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="page" value={page} />
      <button
        type="submit"
        disabled={pending}
        className={`${BTN} bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/20 dark:text-sky-400`}
      >
        {pending ? 'Checking in…' : 'Check in'}
      </button>
    </form>
  );
}

/** Completing releases the escrow payout, so it is confirmed. */
function Complete({ bookingId, page }: { bookingId: string; page: number }) {
  const [armed, setArmed] = useState(false);
  const [state, formAction, pending] = useActionState(completeAction, null);
  useActionToast(state);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`${BTN} bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/20 dark:text-emerald-400`}
      >
        Complete
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="page" value={page} />
      {pending ? (
        <Pending>Completing…</Pending>
      ) : (
        <>
          <span className="text-[11px] text-zinc-500">Release payout?</span>
          <button
            type="submit"
            className={`${BTN} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className={`${BTN} text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300`}
          >
            No
          </button>
        </>
      )}
    </form>
  );
}

/** Host-side cancellation — destructive, and refunds a paid guest. */
function Cancel({
  bookingId,
  paid,
  page,
}: {
  bookingId: string;
  paid: boolean;
  page: number;
}) {
  const [armed, setArmed] = useState(false);
  const [state, formAction, pending] = useActionState(hostCancelAction, null);
  useActionToast(state);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`${BTN} text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400`}
      >
        Cancel
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="reason" value="Cancelled by host" />
      {pending ? (
        <Pending>Cancelling…</Pending>
      ) : (
        <>
          <span className="text-[11px] text-zinc-500">
            {paid ? 'Cancel and refund?' : 'Cancel booking?'}
          </span>
          <button
            type="submit"
            className={`${BTN} bg-rose-600 text-white hover:bg-rose-700`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className={`${BTN} text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300`}
          >
            No
          </button>
        </>
      )}
    </form>
  );
}

export function HostBookingActions({
  bookingId,
  status,
  page,
}: {
  bookingId: string;
  status: string;
  /** Carried through each action so the redirect returns to this page. */
  page: number;
}) {
  // Mirrors the FSM: CONFIRMED may check in or cancel, CHECKED_IN may only
  // complete, everything else is terminal from the host's side.
  const canCheckIn = status === 'CONFIRMED';
  const canComplete = status === 'CHECKED_IN';
  const canCancel = status === 'CONFIRMED' || status === 'PENDING_PAYMENT';

  if (!canCheckIn && !canComplete && !canCancel) {
    return <span className="text-[11px] text-zinc-400 dark:text-zinc-600">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canCheckIn && <CheckIn bookingId={bookingId} page={page} />}
      {canComplete && <Complete bookingId={bookingId} page={page} />}
      {canCancel && (
        <Cancel
          bookingId={bookingId}
          paid={status === 'CONFIRMED'}
          page={page}
        />
      )}
    </div>
  );
}
