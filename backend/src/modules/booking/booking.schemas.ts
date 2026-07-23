import { z } from 'zod';
import {
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  BOOKING_TYPES,
} from './domain/types';

/**
 * Booking API contracts — the single source for controller validation AND
 * the generated OpenAPI document (docs module). Change here, both follow.
 */

export const createHoldSchema = z.object({
  guestId: z.string().uuid(),
  unitId: z.string().uuid(),
  bookingType: z.enum(BOOKING_TYPES),
  checkInUtc: z.coerce.date(),
  checkOutUtc: z.coerce.date(),
  guestsCount: z.number().int().min(1).max(50),
  source: z.enum(BOOKING_SOURCES).optional(),
});

export const confirmBookingSchema = z.object({
  paymentRef: z.string().min(1).max(200),
});

export const cancelBookingSchema = z.object({
  cancelledBy: z.enum(['GUEST', 'HOST', 'ADMIN', 'SYSTEM']),
  reason: z.string().max(1000).nullish(),
});

export const bookingResponseSchema = z.object({
  id: z.string().uuid(),
  bookingCode: z.string(),
  guestId: z.string().uuid(),
  unitId: z.string().uuid(),
  propertyId: z.string().uuid(),
  bookingType: z.enum(BOOKING_TYPES),
  status: z.enum(BOOKING_STATUSES),
  source: z.enum(BOOKING_SOURCES),
  checkInUtc: z.string().datetime(),
  checkOutUtc: z.string().datetime(),
  turnaroundMinutes: z.number().int(),
  guestsCount: z.number().int(),
  holdExpiresAt: z.string().datetime().nullable(),
  currency: z.string().length(3),
  baseAmountMinor: z.number().int(),
  cleaningFeeMinor: z.number().int(),
  serviceFeeMinor: z.number().int(),
  taxesMinor: z.number().int(),
  discountMinor: z.number().int(),
  totalAmountMinor: z.number().int(),
  commissionPct: z.number(),
  commissionMinor: z.number().int(),
  hostPayoutMinor: z.number().int(),
  flashDealId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    requestId: z.string().optional(),
  }),
});
