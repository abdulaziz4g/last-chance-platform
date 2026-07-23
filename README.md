# Last Chance — Hospitality Platform

Global booking platform for nightly stays **and hourly micro-stays** with real-time
flash deals. Zero-tolerance engineering posture on double-booking and payment races:
correctness is enforced at the database engine, not in application code.

## Stack

| Layer | Technology |
|---|---|
| Backend | NestJS (Fastify), Clean Architecture / DDD |
| Database | PostgreSQL 16 + PostGIS — `tstzrange` + GIST exclusion constraints |
| Cache / Locks / Jobs | Redis — Redlock, rate limiting, BullMQ |
| Real-time | NestJS WebSocket gateway + Redis Pub/Sub |
| Search | OpenSearch (geo + faceted) |
| Mobile | Flutter (BLoC/Riverpod) |
| Web / Admin | Next.js App Router + Tailwind |
| Infra | Docker, Kubernetes-ready, S3-compatible storage, Cloudflare |

## Phase progress

- [x] **Phase 1 — PostgreSQL schema**: range-constraint DDL, FSM, escrow ledger, audit → [`db/`](db/README.md)
- [x] **Phase 2 — NestJS core**: booking FSM engine, Redis locking, hold/expiry pipeline → [`backend/`](backend/README.md)
- [x] **Phase 3 — Payments & OpenAPI**: provider ports, idempotent webhooks, escrow ledger, payouts/refunds, `/docs` spec
- [x] **Phase 4 — Web console**: Next.js 15 host studio + admin ops (bookings, payments, escrow ledger) → [`web/`](web/README.md)
- [x] **Phase 5 — Flutter mobile**: Clean Architecture + Riverpod, hold-countdown booking flow, live-verified data layer → [`mobile/`](mobile/README.md)
- [x] **Phase 6 — Ship it**: JWT auth + RBAC + rate limiting, WebSocket availability gateway, production Docker images, K8s manifests, CI/CD → [`deploy/`](deploy/README.md)
- [x] **Discovery — OpenSearch**: geo + faceted unit search with a PostgreSQL availability post-filter; public `/search/units`, web `/discover` → [`backend/src/modules/search/`](backend/src/modules/search/README.md)
- [x] **Flash deals — claim flow**: atomic inventory-claim + discounted hold in one transaction, WS live countdowns, lifecycle worker → [`backend/src/modules/deals/`](backend/src/modules/deals/README.md)

## Full local stack (containers)

```powershell
docker compose --profile full up -d --build   # postgres + redis + backend + web
.\db\run-migrations.ps1                       # first time only
# API http://localhost:3000 · console http://localhost:3001 · docs http://localhost:3000/docs
```

## Quick start (database)

**Option A — Docker (canonical):**

```powershell
docker compose up -d
powershell -ExecutionPolicy Bypass -File .\db\run-migrations.ps1   # migrations + invariant smoke tests
```

**Option B — portable PostgreSQL** (no Docker needed; lives at `C:\Users\lenovo\lastchance-pg`,
delete that folder to remove): server on `localhost:55432`, db/user `lastchance`, local trust auth.

```powershell
C:\Users\lenovo\lastchance-pg\pgsql\bin\pg_ctl -D C:\Users\lenovo\lastchance-pg\data -o "-p 55432" -w start
```

The schema was validated 2026-07-23 against PostgreSQL 16.9 + PostGIS 3.6.2: all 12
migrations apply cleanly and all 15 smoke-test assertions pass.
