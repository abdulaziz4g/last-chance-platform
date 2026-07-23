/**
 * Payment-domain vocabulary — mirrors the PostgreSQL enums 1:1 (db 0002/0013).
 */

export const PAYMENT_PROVIDERS = [
  'STRIPE',
  'HYPERPAY',
  'MOYASAR',
  'TAP',
  'MOCK', // dev/test only — never enabled in production config
] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_METHODS = [
  'VISA',
  'MASTERCARD',
  'MADA',
  'AMEX',
  'APPLE_PAY',
  'STC_PAY',
  'OTHER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'INITIATED',
  'REQUIRES_ACTION',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'VOIDED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type RefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type WebhookStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'SKIPPED';
export type PayoutStatus =
  | 'PENDING'
  | 'ON_HOLD'
  | 'SCHEDULED'
  | 'IN_TRANSIT'
  | 'PAID'
  | 'FAILED'
  | 'REVERSED';

export const LEDGER_ACCOUNTS = [
  'PROVIDER_CLEARING',
  'PLATFORM_ESCROW',
  'PLATFORM_REVENUE',
  'HOST_PAYABLE',
  'TAX_PAYABLE',
  'GUEST_REFUND_CLEARING',
] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];
export type LedgerDirection = 'DEBIT' | 'CREDIT';

export interface Payment {
  id: string;
  bookingId: string;
  provider: PaymentProviderName;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotencyKey: string;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  refundedAmountMinor: number;
  capturedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Refund {
  id: string;
  paymentId: string;
  providerRefundId: string | null;
  status: RefundStatus;
  amountMinor: number;
  currency: string;
  reason: string | null;
  createdAt: Date;
}

export interface Payout {
  id: string;
  hostId: string;
  bookingId: string;
  status: PayoutStatus;
  amountMinor: number;
  currency: string;
  provider: PaymentProviderName | null;
  providerTransferId: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface WebhookEventRecord {
  id: string;
  provider: PaymentProviderName;
  eventId: string;
  eventType: string;
  payload: unknown;
  signatureValid: boolean;
  processingStatus: WebhookStatus;
  attempts: number;
}

export interface LedgerLeg {
  account: LedgerAccount;
  direction: LedgerDirection;
  amountMinor: number;
  description: string;
  bookingId?: string;
  paymentId?: string;
  payoutId?: string;
  hostId?: string;
}
