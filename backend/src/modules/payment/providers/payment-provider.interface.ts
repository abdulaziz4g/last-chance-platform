import type {
  PaymentMethod,
  PaymentProviderName,
} from '../domain/types';

/**
 * The provider port — every PSP (Stripe, HyperPay, Moyasar, Tap, Mock)
 * implements exactly this. Application code never sees provider SDKs or
 * payload shapes; webhooks are normalized into NormalizedWebhookEvent before
 * they touch business logic.
 */

export interface CreateIntentParams {
  paymentId: string;
  bookingCode: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  idempotencyKey: string;
}

export interface CreateIntentResult {
  providerPaymentId: string;
  /** Whatever the client needs to continue (client_secret, redirect URL…). */
  clientAction: Record<string, unknown>;
}

export type NormalizedEventType =
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'REFUND_SUCCEEDED'
  | 'REFUND_FAILED'
  | 'IGNORED';

export interface NormalizedWebhookEvent {
  eventId: string;
  eventType: string; // provider-native type, for the event log
  type: NormalizedEventType;
  providerPaymentId?: string;
  providerRefundId?: string;
  amountMinor?: number;
  currency?: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface PaymentProviderPort {
  readonly name: PaymentProviderName;

  createIntent(params: CreateIntentParams): Promise<CreateIntentResult>;

  /** MUST verify against the raw request body, never a re-serialization. */
  verifySignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean;

  parseEvent(payload: unknown): NormalizedWebhookEvent;

  createRefund(params: {
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string }>;

  createTransfer(params: {
    payoutId: string;
    hostPayoutRef: string | null;
    amountMinor: number;
    currency: string;
  }): Promise<{ providerTransferId: string }>;
}
