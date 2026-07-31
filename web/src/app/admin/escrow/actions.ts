'use server';

import { revalidatePath } from 'next/cache';
import { apiPostSafe } from '@/lib/api';

export type EscrowActionState = { error?: string; ok?: string } | null;

const LEDGER_ACCOUNTS = [
  'PROVIDER_CLEARING',
  'PLATFORM_ESCROW',
  'PLATFORM_REVENUE',
  'HOST_PAYABLE',
  'TAX_PAYABLE',
  'GUEST_REFUND_CLEARING',
] as const;

function refresh(): void {
  revalidatePath('/admin/escrow');
  revalidatePath('/admin/ledger');
  revalidatePath('/admin/payments');
}

/**
 * Posts a compensating entry. Note this reports success in-place rather than
 * redirecting: an operator making a correction wants to see the resulting
 * entry-group id and the updated balances, not be sent somewhere else.
 */
export async function adjustAction(
  _prev: EscrowActionState,
  formData: FormData,
): Promise<EscrowActionState> {
  const fromAccount = formData.get('fromAccount') as string;
  const toAccount = formData.get('toAccount') as string;
  const amountRaw = ((formData.get('amountMinor') as string) ?? '').trim();
  const currency = ((formData.get('currency') as string) ?? '').trim().toUpperCase();
  const reason = ((formData.get('reason') as string) ?? '').trim();
  const bookingId = ((formData.get('bookingId') as string) ?? '').trim();

  if (!(LEDGER_ACCOUNTS as readonly string[]).includes(fromAccount)) {
    return { error: 'Choose a source account.' };
  }
  if (!(LEDGER_ACCOUNTS as readonly string[]).includes(toAccount)) {
    return { error: 'Choose a destination account.' };
  }
  if (fromAccount === toAccount) {
    return { error: 'Source and destination must differ.' };
  }

  const amountMinor = Number(amountRaw);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { error: 'Amount must be a whole number of minor units, above zero.' };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: 'Currency must be a three-letter ISO code, e.g. SAR.' };
  }
  // Checked here as well as in the API: this is the field a future auditor
  // reads to understand why money moved, and an empty one is worthless.
  if (reason.length < 10) {
    return { error: 'Give a reason of at least 10 characters.' };
  }

  const result = await apiPostSafe<{ entryGroupId: string }>(
    '/admin/escrow/adjustments',
    {
      fromAccount,
      toAccount,
      amountMinor,
      currency,
      reason,
      ...(bookingId ? { bookingId } : {}),
    },
  );
  if (!result.ok) return { error: result.error };

  refresh();
  return {
    ok: `Compensating entry posted — group ${result.data.entryGroupId}. The original entries remain in the ledger.`,
  };
}

async function payoutAction(
  formData: FormData,
  endpoint: string,
  done: string,
): Promise<EscrowActionState> {
  const payoutId = formData.get('payoutId') as string;
  const reason = ((formData.get('reason') as string) ?? '').trim();
  if (!payoutId) return { error: 'Missing payout reference.' };
  if (reason.length < 10) {
    return { error: 'Give a reason of at least 10 characters.' };
  }

  const result = await apiPostSafe(
    `/admin/escrow/payouts/${payoutId}/${endpoint}`,
    { reason },
  );
  if (!result.ok) return { error: result.error };

  refresh();
  return { ok: done };
}

export async function holdPayoutAction(
  _prev: EscrowActionState,
  formData: FormData,
): Promise<EscrowActionState> {
  return payoutAction(formData, 'hold', 'Payout held. Nothing will move until it is released.');
}

export async function releasePayoutAction(
  _prev: EscrowActionState,
  formData: FormData,
): Promise<EscrowActionState> {
  return payoutAction(formData, 'release', 'Payout released and re-queued.');
}

export async function retryPayoutAction(
  _prev: EscrowActionState,
  formData: FormData,
): Promise<EscrowActionState> {
  return payoutAction(formData, 'retry', 'Failed payout re-queued for transfer.');
}
