# Last Chance — Backend (Phases 2–3: NestJS Core + Escrow Payments)

NestJS 11 on the Fastify adapter. Modular monolith, microservices-ready: modules
communicate only through injected services and published events, so extracting one
into its own deployment later is an infra change, not a rewrite.

## Layout

```
src/
  main.ts                  Fastify bootstrap + request-context hook
  config/                  Typed env config (zod, fail-fast at boot)
  common/
    context/               AsyncLocalStorage request context (actor + trace id)
    errors/                Domain errors + SQLSTATE -> domain-error mapper
    filters/               Single error->HTTP edge (structured {error:{code,...}})
    logger/                pino structured logging
  infrastructure/
    database/              node-postgres pool; transactions stamped with SET LOCAL app.*
    redis/                 ioredis clients + RedisLockService (NX/PX, fencing tokens)
    queue/                 BullMQ queue registry (booking-expiry)
  modules/
    settings/              platform_settings snapshot, loaded at boot
    booking/
      domain/              Types mirroring the DB enums 1:1
      application/         BookingFsmEngine, PricingService, BookingService
      infrastructure/      Repositories (hand-written SQL — no ORM, by design)
      events/              Redis Pub/Sub availability events (WS gateway feeds on this)
      workers/             BullMQ expiry worker + safety-net sweeper
    payment/
      providers/           PSP port + MOCK (dev) + Stripe (REST, HMAC verify)
      application/         PaymentService, WebhookService, PayoutService, RefundService
      infrastructure/      Repositories + double-entry LedgerService
      workers/             payments queue worker (webhooks, payouts, refunds)
    docs/                  OpenAPI 3.1 generated from the zod schemas (/docs)
    health/                /health readiness (PG + Redis)
```

## The four load-bearing pieces

1. **`DatabaseService`** — no ORM: the Phase 1 schema's generated columns, exclusion
   constraints, and custom SQLSTATEs are the contract, and SQL stays the source of
   truth. Every transaction is stamped with `SET LOCAL app.actor_id/actor_type/
   request_id` from the AsyncLocalStorage context — that is what attributes DB audit
   and FSM-history rows. All PG errors cross this boundary as typed domain errors
   (`23P01`/`LC409` → `UnitUnavailableError`, `LC400` → `InvalidTransitionError`, …).

2. **`BookingFsmEngine`** — loads the transition whitelist from
   `booking_fsm_transitions` at boot (one source of truth, two enforcement layers:
   engine for fast friendly errors, DB trigger as the authority).

3. **`RedisLockService`** — SET NX PX + owner-token Lua release/extend + monotonic
   fencing tokens. It is a *contention shield*, not a correctness mechanism: held for
   milliseconds around the check+insert critical section so a flash-deal herd
   serializes in Redis instead of hammering PostgreSQL. If every lock vanished, the
   exclusion constraint still makes double-booking impossible.

4. **`BookingService.createHold`** — the critical write path:
   lock → transaction(pre-check + insert `PENDING_PAYMENT` with `hold_expires_at`)
   → schedule BullMQ delayed expiry (+ once-a-minute `fn_expire_stale_holds()`
   sweeper as backstop) → publish availability event over Redis Pub/Sub.
   The 10-minute hold is the durable DB row — never a long-lived lock.

## Running

```powershell
docker compose up -d                     # from repo root: PostGIS + Redis
cd backend
npm install
npm run start:dev                        # http://localhost:3000
npm test                                 # unit tests (FSM, pricing)
npm run smoke                            # live end-to-end suite vs the Docker stack
```

> Windows note: if the repo path contains `;` (the PATH delimiter), `npx`/npm
> scripts break. Rename the folder (recommended) or invoke binaries directly:
> `node node_modules\typescript\bin\tsc`, `node node_modules\jest\bin\jest.js`.

Dev-only actor headers until Phase 3 auth: `x-actor-id`, `x-actor-type`, `x-request-id`.

## The escrow money cycle (Phase 3)

```
initiate ──> provider intent (idempotency key forwarded — retries can't double-charge)
   webhook (signed, raw-body verified, UNIQUE event id) ──> queued, 200 fast
   worker: payment CAPTURED + ledger [PROVIDER_CLEARING -> PLATFORM_ESCROW]  (one tx)
           booking -> CONFIRMED (idempotent CAS)
   ...stay happens...
   complete ──> payout job: payout row (UNIQUE booking_id = double-payout guard)
           + THE SPLIT: escrow -> HOST_PAYABLE + PLATFORM_REVENUE + TAX_PAYABLE (one tx)
   transfer executed ──> settle: [HOST_PAYABLE -> PROVIDER_CLEARING], payout PAID
   cancel ──> refund job -> provider refund -> webhook -> ledger + booking REFUNDED
```

Every ledger group balances (app assert + DEFERRED DB trigger); every webhook
and job handler is idempotent, so at-least-once delivery is safe everywhere.

## API surface — full spec at `/docs` (OpenAPI 3.1 from the zod schemas)

| Route | Purpose |
|---|---|
| `POST /bookings/hold` | Place a 10-minute payment hold |
| `POST /payments/initiate` | Start payment; returns provider client action |
| `POST /webhooks/payments/:provider` | Signed, idempotent PSP webhook intake |
| `POST /bookings/:id/cancel` | Cancel (refund pipeline starts automatically) |
| `POST /bookings/:id/check-in` / `:id/complete` | Stay lifecycle (complete → payout) |
| `GET /payouts/booking/:bookingId` | Payout status |
| `GET /bookings/:id`, `GET /payments/:id` | Reads |
| `GET /health`, `GET /docs` | Ops + docs |

## Verified (2026-07-23)

- `tsc --noEmit` clean (strict), 7/7 unit tests green.
- Phase 2 smoke (`npm run smoke`): **15/15** — overlap/buffer rejection through
  the service path, FSM enforcement, idempotent expiry, 5-way concurrency
  burst with exactly one winner.
- Phase 3 smoke (`npm run smoke:payments`): **21/21** — full escrow cycle over
  live HTTP: signed capture webhook -> CONFIRMED + escrow ledger; duplicate
  event ignored; tampered signature 400; complete -> payout PAID with escrow
  and host-payable settling to exactly zero; cancel -> provider refund ->
  REFUNDED with refund clearing carrying the returned amount; OpenAPI served.
