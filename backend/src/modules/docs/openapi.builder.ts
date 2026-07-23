import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  bookingResponseSchema,
  cancelBookingSchema,
  confirmBookingSchema,
  createHoldSchema,
  errorEnvelopeSchema,
} from '../booking/booking.schemas';
import {
  initiatePaymentResponseSchema,
  initiatePaymentSchema,
  payoutResponseSchema,
  webhookAckSchema,
} from '../payment/payment.schemas';

extendZodWithOpenApi(z);

/**
 * OpenAPI 3.1 document generated from the SAME zod schemas the controllers
 * validate with — the spec cannot drift from the runtime behavior. Served at
 * /docs (UI) and /docs/openapi.json (spec; feed it to client generators).
 */
export function buildOpenApiDocument(): ReturnType<
  OpenApiGeneratorV31['generateDocument']
> {
  const registry = new OpenAPIRegistry();

  const Booking = registry.register('Booking', bookingResponseSchema);
  const ErrorEnvelope = registry.register('ErrorEnvelope', errorEnvelopeSchema);
  const InitiatePaymentResult = registry.register(
    'InitiatePaymentResult',
    initiatePaymentResponseSchema,
  );
  const Payout = registry.register('Payout', payoutResponseSchema);
  const WebhookAck = registry.register('WebhookAck', webhookAckSchema);

  const errorResponses = {
    400: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorEnvelope } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorEnvelope } },
    },
    409: {
      description:
        'Conflict — UNIT_UNAVAILABLE, INVALID_STATE_TRANSITION, HOLD_EXPIRED, or RESOURCE_CONTENTION',
      content: { 'application/json': { schema: ErrorEnvelope } },
    },
  } as const;

  const jsonBody = (schema: z.ZodTypeAny) => ({
    required: true,
    content: { 'application/json': { schema } },
  });
  const jsonOk = (schema: z.ZodTypeAny, description: string) => ({
    description,
    content: { 'application/json': { schema } },
  });
  const uuidParam = (name: string) =>
    z.object({ [name]: z.string().uuid() });

  // ---- bookings -------------------------------------------------------------
  registry.registerPath({
    method: 'post',
    path: '/bookings/hold',
    tags: ['Bookings'],
    summary: 'Place a 10-minute payment hold on a unit',
    description:
      'Creates a PENDING_PAYMENT booking that blocks inventory (engine-level ' +
      'exclusion constraint, cleaning turnaround included). Expires ' +
      'automatically if payment does not complete in time.',
    request: { body: jsonBody(createHoldSchema) },
    responses: {
      201: jsonOk(Booking, 'Hold placed'),
      ...errorResponses,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/bookings/{id}/confirm',
    tags: ['Bookings'],
    summary: 'Confirm a held booking (admin/manual path)',
    description:
      'Normal confirmation is webhook-driven via POST /payments/initiate + ' +
      'provider capture webhook. This endpoint exists for back-office flows.',
    request: {
      params: uuidParam('id'),
      body: jsonBody(confirmBookingSchema),
    },
    responses: { 200: jsonOk(Booking, 'Confirmed'), ...errorResponses },
  });
  registry.registerPath({
    method: 'post',
    path: '/bookings/{id}/cancel',
    tags: ['Bookings'],
    summary: 'Cancel a booking (refund pipeline starts automatically)',
    request: {
      params: uuidParam('id'),
      body: jsonBody(cancelBookingSchema),
    },
    responses: { 200: jsonOk(Booking, 'Cancelled'), ...errorResponses },
  });
  registry.registerPath({
    method: 'post',
    path: '/bookings/{id}/check-in',
    tags: ['Bookings'],
    summary: 'Mark the guest as checked in',
    request: { params: uuidParam('id') },
    responses: { 200: jsonOk(Booking, 'Checked in'), ...errorResponses },
  });
  registry.registerPath({
    method: 'post',
    path: '/bookings/{id}/complete',
    tags: ['Bookings'],
    summary: 'Complete the stay (triggers escrow split + host payout)',
    request: { params: uuidParam('id') },
    responses: { 200: jsonOk(Booking, 'Completed'), ...errorResponses },
  });
  registry.registerPath({
    method: 'get',
    path: '/bookings/{id}',
    tags: ['Bookings'],
    summary: 'Fetch one booking',
    request: { params: uuidParam('id') },
    responses: { 200: jsonOk(Booking, 'Booking'), ...errorResponses },
  });

  // ---- payments -------------------------------------------------------------
  registry.registerPath({
    method: 'post',
    path: '/payments/initiate',
    tags: ['Payments'],
    summary: 'Start payment for a held booking',
    description:
      'Idempotent (client Idempotency-Key supported). Returns the provider ' +
      'client action (client_secret / redirect). Capture arrives via webhook.',
    request: { body: jsonBody(initiatePaymentSchema) },
    responses: {
      201: jsonOk(InitiatePaymentResult, 'Payment initiated'),
      ...errorResponses,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/payouts/booking/{bookingId}',
    tags: ['Payments'],
    summary: 'Payout status for a completed booking',
    request: { params: uuidParam('bookingId') },
    responses: { 200: jsonOk(Payout, 'Payout'), ...errorResponses },
  });

  // ---- search ---------------------------------------------------------------
  const searchQuery = z.object({
    text: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    radiusKm: z.number().optional(),
    city: z.string().optional(),
    mode: z.enum(['HOURLY', 'NIGHTLY']).optional(),
    guests: z.number().int().optional(),
    minPriceMinor: z.number().int().optional(),
    maxPriceMinor: z.number().int().optional(),
    amenities: z.array(z.string()).optional(),
    instantBookOnly: z.boolean().optional(),
    checkInUtc: z.string().datetime().optional(),
    checkOutUtc: z.string().datetime().optional(),
    sort: z
      .enum(['relevance', 'price_asc', 'price_desc', 'rating', 'distance'])
      .optional(),
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
  });
  const SearchQuery = registry.register('SearchQuery', searchQuery);
  const SearchResults = registry.register(
    'SearchResults',
    z.object({
      total: z.number().int(),
      page: z.number().int(),
      pageSize: z.number().int(),
      availabilityChecked: z.boolean(),
      items: z.array(
        z.object({
          unitId: z.string().uuid(),
          propertyId: z.string().uuid(),
          unitName: z.string(),
          propertyName: z.string(),
          propertyType: z.string(),
          city: z.string(),
          distanceKm: z.number().nullable(),
          currency: z.string(),
          hourlyRateMinor: z.number().int().nullable(),
          nightlyRateMinor: z.number().int().nullable(),
          maxGuests: z.number().int(),
          amenities: z.array(z.string()),
          ratingAvg: z.number().nullable(),
          ratingCount: z.number().int(),
          instantBook: z.boolean(),
          available: z.boolean().nullable(),
        }),
      ),
      facets: z.object({
        propertyType: z.array(z.object({ key: z.string(), count: z.number() })),
        amenities: z.array(z.object({ key: z.string(), count: z.number() })),
        city: z.array(z.object({ key: z.string(), count: z.number() })),
      }),
    }),
  );
  registry.registerPath({
    method: 'post',
    path: '/search/units',
    tags: ['Search'],
    summary: 'Discover units — geo radius, full-text, facets, availability',
    description:
      'OpenSearch-backed candidate retrieval (geo + faceted), then — when a ' +
      'checkInUtc/checkOutUtc window is supplied — a PostgreSQL availability ' +
      'post-filter using the SAME exclusion-constraint truth as booking, so ' +
      'results can never show a slot the booking engine would reject. Public.',
    request: { body: jsonBody(SearchQuery) },
    responses: { 200: jsonOk(SearchResults, 'Search results'), ...errorResponses },
  });

  // ---- flash deals ----------------------------------------------------------
  const FlashDealView = registry.register(
    'FlashDealView',
    z.object({
      id: z.string().uuid(),
      unitId: z.string().uuid(),
      propertyId: z.string().uuid(),
      propertyName: z.string(),
      unitName: z.string(),
      city: z.string(),
      title: z.string(),
      discountPct: z.number(),
      status: z.enum(['SCHEDULED', 'ACTIVE', 'SOLD_OUT', 'ENDED', 'CANCELLED']),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      quantityTotal: z.number().int(),
      quantityClaimed: z.number().int(),
      quantityRemaining: z.number().int(),
      currency: z.string(),
      baseHourlyRateMinor: z.number().int().nullable(),
      baseNightlyRateMinor: z.number().int().nullable(),
      secondsRemaining: z.number().int(),
    }),
  );
  registry.registerPath({
    method: 'get',
    path: '/deals/active',
    tags: ['Flash Deals'],
    summary: 'Live flash-deal feed (public)',
    description:
      'Currently-claimable deals with remaining inventory and a countdown ' +
      'seed. Real-time updates (claims, sold-out, ended) arrive over the ' +
      'WebSocket gateway on the lc.events.deals channel.',
    responses: {
      200: jsonOk(z.array(FlashDealView), 'Active deals'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/deals',
    tags: ['Flash Deals'],
    summary: 'Create a flash deal (HOST/ADMIN)',
    request: {
      body: jsonBody(
        z.object({
          unitId: z.string().uuid(),
          title: z.string(),
          discountPct: z.number(),
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime(),
          quantityTotal: z.number().int(),
          applicableStayFrom: z.string().datetime().nullish(),
          applicableStayTo: z.string().datetime().nullish(),
        }),
      ),
    },
    responses: { 201: jsonOk(FlashDealView, 'Created'), ...errorResponses },
  });
  registry.registerPath({
    method: 'post',
    path: '/deals/{id}/claim',
    tags: ['Flash Deals'],
    summary: 'Claim a deal — places a discounted 10-minute hold',
    description:
      'Atomically decrements the deal inventory and creates a discounted ' +
      'PENDING_PAYMENT booking in ONE transaction. 409 FLASH_DEAL_SOLD_OUT ' +
      'when exhausted; 409 UNIT_UNAVAILABLE when the window is taken (no deal ' +
      'slot is consumed in that case).',
    request: {
      params: uuidParam('id'),
      body: jsonBody(
        z.object({
          guestId: z.string().uuid(),
          bookingType: z.enum(['HOURLY', 'NIGHTLY']),
          checkInUtc: z.string().datetime(),
          checkOutUtc: z.string().datetime(),
          guestsCount: z.number().int(),
        }),
      ),
    },
    responses: { 201: jsonOk(Booking, 'Discounted hold placed'), ...errorResponses },
  });

  // ---- webhooks -------------------------------------------------------------
  registry.registerPath({
    method: 'post',
    path: '/webhooks/payments/{provider}',
    tags: ['Webhooks'],
    summary: 'Provider webhook intake (signature-verified, idempotent)',
    description:
      'Signature is verified against the raw body. Duplicate event ids are ' +
      'acknowledged 200 and never reprocessed. Processing is asynchronous.',
    request: {
      params: z.object({
        provider: z.enum(['STRIPE', 'HYPERPAY', 'MOYASAR', 'TAP', 'MOCK']),
      }),
    },
    responses: {
      200: jsonOk(WebhookAck, 'Event recorded (or duplicate)'),
      400: {
        description: 'Invalid signature',
        content: { 'application/json': { schema: WebhookAck } },
      },
    },
  });

  // ---- health ---------------------------------------------------------------
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Ops'],
    summary: 'Readiness probe (PostgreSQL + Redis)',
    responses: {
      200: jsonOk(
        z.object({
          status: z.enum(['ok', 'degraded']),
          postgres: z.boolean(),
          redis: z.boolean(),
        }),
        'Health report',
      ),
    },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Last Chance API',
      version: '0.3.0',
      description:
        'Hourly micro-stays & flash deals booking platform. ' +
        'All money values are integer minor units; all instants are UTC ISO-8601.',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local dev' }],
  });
}
