# Last Chance — Web Console (Phase 4)

Next.js 15 (App Router) + React 19 + Tailwind CSS v4. Two consoles behind one
design system:

- **`/host`** — Host studio: earnings (settled / pending escrow), units with
  hourly & nightly rates, recent bookings.
- **`/admin`** — Operations: live KPIs (active holds, upcoming stays, captured
  volume, failed webhooks), bookings, payments, payouts, webhook events, and
  the double-entry **escrow ledger** with per-account balances.

## Architecture decisions

- **Server Components only for data.** Every dashboard page fetches the NestJS
  API server-side (`src/lib/api.ts`, `BACKEND_URL`, default
  `http://localhost:3000`). The browser never talks to the API: no CORS
  surface, no exposed internal endpoints, always-fresh reads (`no-store`).
- **Design system, not a component library.** Hairline borders, near-black
  `ink` canvas, one brass accent, tabular numerals for money, uppercase
  tracked labels (`src/components/ui.tsx`). Dark-first with a class-strategy
  toggle applied pre-paint (no flash).
- **Money stays integer minor units** until the last formatting step
  (`src/lib/format.ts`); all times render as UTC.
- The read endpoints live in the backend's `reporting` module (CQRS-lite read
  side, denormalized joins, no domain logic). Auth guards land in Phase 6;
  until then the API client sends the dev actor header.

## Running

```powershell
# backend + stack must be up (see backend/README.md), then:
cd web
npm install
npm run dev        # http://localhost:3001  (or: build + start)
```

Verified 2026-07-23: production build clean; all five routes rendered against
the live backend with real escrow-cycle data, zero console errors.
