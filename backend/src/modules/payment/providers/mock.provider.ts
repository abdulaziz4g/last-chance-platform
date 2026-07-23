import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../../config/config.service';
import {
  CreateIntentParams,
  CreateIntentResult,
  NormalizedWebhookEvent,
  PaymentProviderPort,
} from './payment-provider.interface';

/**
 * The MOCK provider — a deterministic in-house PSP for development and the
 * integration suite. It exercises the EXACT same pipeline as real providers:
 * signed webhooks over raw bodies, normalized events, idempotency by event id.
 *
 * Webhook contract (what the test suite sends):
 *   POST /webhooks/payments/MOCK
 *   x-mock-signature: hex(HMAC-SHA256(rawBody, MOCK_WEBHOOK_SECRET))
 *   body: { id, type: 'payment.captured'|'payment.failed'|'refund.succeeded',
 *           data: { providerPaymentId, amountMinor, currency, providerRefundId? } }
 */
@Injectable()
export class MockPaymentProvider implements PaymentProviderPort {
  readonly name = 'MOCK' as const;

  constructor(private readonly config: AppConfigService) {}

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    return {
      providerPaymentId: `mock_pi_${randomUUID().replaceAll('-', '')}`,
      clientAction: {
        type: 'MOCK_CONFIRM',
        note: 'Dev provider: capture by POSTing a signed payment.captured webhook',
        amountMinor: params.amountMinor,
        currency: params.currency,
      },
    };
  }

  verifySignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const provided = headers['x-mock-signature'];
    if (typeof provided !== 'string' || provided.length === 0) return false;
    const expected = createHmac('sha256', this.config.mockWebhookSecret)
      .update(rawBody)
      .digest('hex');
    // Constant-time comparison — a signature check that leaks timing is broken.
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseEvent(payload: unknown): NormalizedWebhookEvent {
    const p = payload as {
      id?: string;
      type?: string;
      data?: {
        providerPaymentId?: string;
        providerRefundId?: string;
        amountMinor?: number;
        currency?: string;
        failureCode?: string;
        failureMessage?: string;
      };
    };
    const base = {
      eventId: p.id ?? `mock_evt_${randomUUID()}`,
      eventType: p.type ?? 'unknown',
      providerPaymentId: p.data?.providerPaymentId,
      providerRefundId: p.data?.providerRefundId,
      amountMinor: p.data?.amountMinor,
      currency: p.data?.currency,
      failureCode: p.data?.failureCode,
      failureMessage: p.data?.failureMessage,
    };
    switch (p.type) {
      case 'payment.captured':
        return { ...base, type: 'PAYMENT_CAPTURED' };
      case 'payment.failed':
        return { ...base, type: 'PAYMENT_FAILED' };
      case 'refund.succeeded':
        return { ...base, type: 'REFUND_SUCCEEDED' };
      case 'refund.failed':
        return { ...base, type: 'REFUND_FAILED' };
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
    void params;
    return { providerRefundId: `mock_re_${randomUUID().replaceAll('-', '')}` };
  }

  async createTransfer(params: {
    payoutId: string;
    hostPayoutRef: string | null;
    amountMinor: number;
    currency: string;
  }): Promise<{ providerTransferId: string }> {
    void params;
    return { providerTransferId: `mock_tr_${randomUUID().replaceAll('-', '')}` };
  }
}
