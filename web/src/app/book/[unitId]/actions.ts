'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { apiPostSafe, getPaymentConfig } from '@/lib/api';
import type { Booking, InitiatePaymentResult } from '@/lib/api';

export async function holdAction(
  _prev: { error?: string; retryAfterSec?: number } | null,
  formData: FormData,
): Promise<{ error?: string; retryAfterSec?: number }> {
  const session = await getSession();
  if (!session) return { error: 'Please sign in first.' };

  const unitId = formData.get('unitId') as string;
  const bookingType = formData.get('bookingType') as 'HOURLY' | 'NIGHTLY';
  const checkInUtc = formData.get('checkInUtc') as string;
  const checkOutUtc = formData.get('checkOutUtc') as string;
  const guestsCount = Number(formData.get('guestsCount'));

  const result = await apiPostSafe<Booking>('/bookings/hold', {
    guestId: session.sub,
    unitId,
    bookingType,
    checkInUtc: new Date(checkInUtc).toISOString(),
    checkOutUtc: new Date(checkOutUtc).toISOString(),
    guestsCount,
  });

  // Pass the retry window through so the form can hold its button shut
  // instead of letting an impatient reader burn the rest of the budget.
  if (!result.ok) {
    return { error: result.error, retryAfterSec: result.retryAfterSec };
  }

  redirect(`/book/${unitId}/pay?bookingId=${result.data.id}`);
}

export interface PayActionState {
  error?: string;
  /**
   * Set only for real PSPs: the browser must collect card details itself and
   * confirm directly with the provider, so the secret comes back to the client
   * rather than the server completing the payment.
   */
  stripe?: { clientSecret: string; paymentId: string };
}

export async function payAction(
  _prev: PayActionState | null,
  formData: FormData,
): Promise<PayActionState> {
  const bookingId = formData.get('bookingId') as string;
  const method = formData.get('method') as string;

  // Resolved here rather than read from the form: a hidden field is the
  // client's to edit, and downgrading a real PSP to the dev provider must not
  // be a thing a posted form can ask for.
  const { provider } = await getPaymentConfig();

  const result = await apiPostSafe<InitiatePaymentResult>('/payments/initiate', {
    bookingId,
    provider,
    method,
  });

  if (!result.ok) return { error: result.error };

  const clientAction = result.data.clientAction;
  const paymentId = result.data.payment.id;

  switch (clientAction?.type) {
    case 'MOCK_CONFIRM': {
      // The dev PSP has no sheet to present; drive its server-signed capture
      // through the same webhook pipeline a real provider would use.
      const capture = await apiPostSafe<{ accepted: boolean }>(
        `/payments/${paymentId}/simulate-capture`,
        {},
      );
      if (!capture.ok) return { error: capture.error };
      break;
    }

    case 'STRIPE_CLIENT_SECRET': {
      const clientSecret = clientAction.clientSecret as string | undefined;
      if (!clientSecret) {
        return { error: 'The payment provider did not return a client secret.' };
      }
      // Hand back to the browser — confirmation happens there, and the booking
      // is settled by Stripe's webhook, not by this request.
      return { stripe: { clientSecret, paymentId } };
    }

    default:
      return {
        error: `Unsupported payment action: ${clientAction?.type ?? 'none'}`,
      };
  }

  redirect(`/book/confirmation?bookingId=${bookingId}`);
}
