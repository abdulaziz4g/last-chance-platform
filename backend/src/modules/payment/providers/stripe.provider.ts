import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../../config/config.service';
import {
  CreateIntentParams,
  CreateIntentResult,
  NormalizedWebhookEvent,
  PaymentProviderPort,
} from './payment-provider.interface';

const STRIPE_API = 'https://api.stripe.com/v1';
/** Reject webhook timestamps older than this — replay-attack window. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Stripe integration over its REST API (no SDK — one less supply-chain
 * dependency; the API surface we use is three endpoints).
 *
 * Enabled only when STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are configured;
 * the registry skips it otherwise. Signature verification implements the
 * documented `Stripe-Signature: t=...,v1=...` scheme: HMAC-SHA256 over
 * `${t}.${rawBody}` with the webhook secret, constant-time compare, bounded
 * timestamp skew.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProviderPort {
  readonly name = 'STRIPE' as const;

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.stripeSecretKey && this.config.stripeWebhookSecret);
  }

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    const body = new URLSearchParams({
      amount: String(params.amountMinor),
      currency: params.currency.toLowerCase(),
      'metadata[payment_id]': params.paymentId,
      'metadata[booking_code]': params.bookingCode,
      'automatic_payment_methods[enabled]': 'true',
    });
    const res = await fetch(`${STRIPE_API}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': params.idempotencyKey,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Stripe intent creation failed: ${res.status} ${await res.text()}`);
    }
    const intent = (await res.json()) as { id: string; client_secret: string };
    return {
      providerPaymentId: intent.id,
      clientAction: { type: 'STRIPE_CLIENT_SECRET', clientSecret: intent.client_secret },
    };
  }

  verifySignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const header = headers['stripe-signature'];
    if (typeof header !== 'string') return false;

    const parts = new Map(
      header.split(',').map((kv) => kv.split('=', 2) as [string, string]),
    );
    const t = parts.get('t');
    const v1 = parts.get('v1');
    if (!t || !v1) return false;

    const age = Math.abs(Date.now() / 1000 - Number(t));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;

    const expected = createHmac('sha256', this.config.stripeWebhookSecret ?? '')
      .update(`${t}.${rawBody.toString('utf8')}`)
      .digest('hex');
    const a = Buffer.from(v1, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseEvent(payload: unknown): NormalizedWebhookEvent {
    const p = payload as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const obj = p.data?.object ?? {};
    const base = {
      eventId: p.id ?? 'unknown',
      eventType: p.type ?? 'unknown',
      providerPaymentId:
        (obj['payment_intent'] as string | undefined) ??
        (typeof obj['id'] === 'string' && (obj['id'] as string).startsWith('pi_')
          ? (obj['id'] as string)
          : undefined),
      amountMinor: obj['amount'] as number | undefined,
      currency:
        typeof obj['currency'] === 'string'
          ? (obj['currency'] as string).toUpperCase()
          : undefined,
    };
    switch (p.type) {
      case 'payment_intent.succeeded':
        return { ...base, type: 'PAYMENT_CAPTURED' };
      case 'payment_intent.payment_failed':
        return {
          ...base,
          type: 'PAYMENT_FAILED',
          failureCode: (obj['last_payment_error'] as { code?: string })?.code,
        };
      case 'refund.created':
        return { ...base, type: 'IGNORED' }; // wait for the terminal event
      case 'refund.updated':
      case 'charge.refunded': {
        const refundId = typeof obj['id'] === 'string' ? (obj['id'] as string) : undefined;
        return {
          ...base,
          type: 'REFUND_SUCCEEDED',
          providerRefundId: refundId?.startsWith('re_') ? refundId : undefined,
        };
      }
      default:
        return { ...base, type: 'IGNORED' };
    }
  }

  async createRefund(params: {
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string }> {
    const body = new URLSearchParams({
      payment_intent: params.providerPaymentId,
      amount: String(params.amountMinor),
    });
    const res = await fetch(`${STRIPE_API}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': params.idempotencyKey,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Stripe refund failed: ${res.status} ${await res.text()}`);
    }
    const refund = (await res.json()) as { id: string };
    return { providerRefundId: refund.id };
  }

  async createTransfer(params: {
    payoutId: string;
    hostPayoutRef: string | null;
    amountMinor: number;
    currency: string;
  }): Promise<{ providerTransferId: string }> {
    if (!params.hostPayoutRef) {
      throw new Error('Host has no Stripe Connect account (payout_provider_ref)');
    }
    const body = new URLSearchParams({
      amount: String(params.amountMinor),
      currency: params.currency.toLowerCase(),
      destination: params.hostPayoutRef,
      'metadata[payout_id]': params.payoutId,
    });
    const res = await fetch(`${STRIPE_API}/transfers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `payout-${params.payoutId}`,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Stripe transfer failed: ${res.status} ${await res.text()}`);
    }
    const transfer = (await res.json()) as { id: string };
    return { providerTransferId: transfer.id };
  }
}
