import { z } from 'zod';
import {
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
} from './domain/types';

export { parseWith } from '../../common/validation';

export const initiatePaymentSchema = z.object({
  bookingId: z.string().uuid(),
  provider: z.enum(PAYMENT_PROVIDERS),
  method: z.enum(PAYMENT_METHODS),
  /** Client-supplied for safe retries; defaults to one attempt per booking+provider. */
  idempotencyKey: z.string().min(8).max(120).optional(),
});

export const paymentResponseSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  provider: z.enum(PAYMENT_PROVIDERS),
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  idempotencyKey: z.string(),
  providerPaymentId: z.string().nullable(),
  amountMinor: z.number().int(),
  currency: z.string().length(3),
  refundedAmountMinor: z.number().int(),
  capturedAt: z.string().datetime().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const initiatePaymentResponseSchema = z.object({
  payment: paymentResponseSchema,
  clientAction: z.record(z.unknown()).nullable(),
});

export const payoutResponseSchema = z.object({
  id: z.string().uuid(),
  hostId: z.string().uuid(),
  bookingId: z.string().uuid(),
  status: z.enum([
    'PENDING',
    'ON_HOLD',
    'SCHEDULED',
    'IN_TRANSIT',
    'PAID',
    'FAILED',
    'REVERSED',
  ]),
  amountMinor: z.number().int(),
  currency: z.string().length(3),
  provider: z.enum(PAYMENT_PROVIDERS).nullable(),
  providerTransferId: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const webhookAckSchema = z.object({
  received: z.boolean(),
  duplicate: z.boolean(),
});
