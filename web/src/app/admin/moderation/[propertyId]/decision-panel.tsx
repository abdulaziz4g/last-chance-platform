'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
// From lib/moderation, not lib/api: api.ts reaches next/headers through
// lib/session and cannot be imported into a client bundle.
import { MODERATION_REASON_CODES } from '@/lib/moderation';
import type { ModerationStatus } from '@/lib/moderation';
import {
  approveAction,
  rejectAction,
  reinstateAction,
  suspendAction,
} from '../actions';

const REASON_LABELS: Record<string, string> = {
  DOCUMENT_ILLEGIBLE: 'Document is illegible',
  DOCUMENT_EXPIRED: 'Document has expired',
  DEED_NAME_MISMATCH: 'Deed name does not match the host',
  PERMIT_INVALID: 'Tourism permit is invalid',
  PERMIT_NOT_FOUND: 'Tourism permit not found in the register',
  NATIONAL_ADDRESS_MISMATCH: 'National Address does not match the deed',
  LOCATION_MISMATCH: 'Map location does not match the address',
  PHOTOS_INSUFFICIENT: 'Photos are insufficient or misleading',
  PROHIBITED_CONTENT: 'Prohibited content',
  DUPLICATE_LISTING: 'Duplicate of an existing listing',
  OTHER: 'Other (explain below)',
};

function Submit({
  label,
  tone,
  disabled,
}: {
  label: string;
  tone: 'approve' | 'danger' | 'neutral';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const base =
    'rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50';
  const tones = {
    approve: 'bg-emerald-600 text-white hover:bg-emerald-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    neutral:
      'border border-zinc-300 text-zinc-700 hover:border-zinc-500 dark:border-zinc-600 dark:text-zinc-200',
  };
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${base} ${tones[tone]}`}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

function ReasonFields({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <label
        htmlFor={`${idPrefix}-reason`}
        className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"
      >
        Reason
      </label>
      <select
        id={`${idPrefix}-reason`}
        name="reasonCode"
        required
        defaultValue=""
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
      >
        <option value="" disabled>
          Choose a reason…
        </option>
        {MODERATION_REASON_CODES.map((code) => (
          <option key={code} value={code}>
            {REASON_LABELS[code] ?? code}
          </option>
        ))}
      </select>

      <label
        htmlFor={`${idPrefix}-notes`}
        className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-300"
      >
        Notes to the host
      </label>
      <textarea
        id={`${idPrefix}-notes`}
        name="notes"
        rows={3}
        maxLength={2000}
        placeholder="What exactly needs fixing? This is what the host sees."
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
      />
    </>
  );
}

/**
 * The decision controls.
 *
 * Which forms render is driven by `allowedNext`, which the API derives from the
 * moderation FSM table — the same table the database trigger enforces. Offering
 * a button the server would refuse is how a reviewer learns to distrust the UI.
 */
export function DecisionPanel({
  propertyId,
  status,
  allowedNext,
  blockers,
}: {
  propertyId: string;
  status: ModerationStatus;
  allowedNext: ModerationStatus[];
  blockers: string[];
}) {
  const [approveState, approve] = useActionState(approveAction, null);
  const [rejectState, reject] = useActionState(rejectAction, null);
  const [suspendState, suspend] = useActionState(suspendAction, null);
  const [reinstateState, reinstate] = useActionState(reinstateAction, null);
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);

  const can = (next: ModerationStatus) => allowedNext.includes(next);
  const error =
    approveState?.error ??
    rejectState?.error ??
    suspendState?.error ??
    reinstateState?.error;

  return (
    <div className="space-y-6">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      {can('APPROVED') && status === 'PENDING_APPROVAL' ? (
        <form action={approve} className="space-y-2">
          <input type="hidden" name="propertyId" value={propertyId} />
          {blockers.length > 0 ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Cannot approve until these are resolved:{' '}
              {blockers.join(', ').toLowerCase().replace(/_/g, ' ')}
            </p>
          ) : (
            <p className="text-xs text-taupe-500">
              Approving publishes this listing to search and the map
              immediately.
            </p>
          )}
          <Submit
            label="Approve listing"
            tone="approve"
            disabled={blockers.length > 0}
          />
        </form>
      ) : null}

      {can('REJECTED') ? (
        <form action={reject} className="space-y-2 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <input type="hidden" name="propertyId" value={propertyId} />
          <h3 className="text-sm font-semibold">Reject</h3>
          <ReasonFields idPrefix="reject" />
          <Submit label="Reject listing" tone="danger" />
        </form>
      ) : null}

      {can('SUSPENDED') ? (
        <form
          action={suspend}
          className="space-y-2 border-t border-zinc-200 pt-6 dark:border-zinc-800"
        >
          <input type="hidden" name="propertyId" value={propertyId} />
          <h3 className="text-sm font-semibold">Suspend</h3>
          <p className="text-xs text-taupe-500">
            Takes a live listing off the map at once and stops it accepting
            bookings. Existing confirmed stays are not cancelled.
          </p>
          {/* Suspension hits a listing guests may be mid-booking on, so it
              asks twice. Approve and reject do not: those act on something
              that is not live yet. */}
          {confirmingSuspend ? (
            <>
              <ReasonFields idPrefix="suspend" />
              <div className="flex items-center gap-2">
                <Submit label="Confirm suspension" tone="danger" />
                <button
                  type="button"
                  onClick={() => setConfirmingSuspend(false)}
                  className="text-sm text-taupe-500 underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingSuspend(true)}
              className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Suspend listing…
            </button>
          )}
        </form>
      ) : null}

      {status === 'SUSPENDED' && can('APPROVED') ? (
        <form
          action={reinstate}
          className="space-y-2 border-t border-zinc-200 pt-6 dark:border-zinc-800"
        >
          <input type="hidden" name="propertyId" value={propertyId} />
          <h3 className="text-sm font-semibold">Reinstate</h3>
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            placeholder="Why is this being reinstated?"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <Submit label="Reinstate listing" tone="neutral" />
        </form>
      ) : null}

      {allowedNext.length === 0 ? (
        <p className="text-sm text-taupe-500">
          No further action is available from {status.toLowerCase().replace('_', ' ')}.
        </p>
      ) : null}
    </div>
  );
}
