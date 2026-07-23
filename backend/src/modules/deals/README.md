# Flash Deals (claim flow)

Time-boxed, inventory-limited discounts on a unit, claimed by placing a
**discounted hold** — with the inventory decrement and the booking committed
in a single transaction so the two can never disagree.

## The claim, atomically

```
POST /deals/{id}/claim
  DealService.claim → pre-validates (ACTIVE, in window, inventory, stay-range)
     └─ BookingService.createHold({ ..., flashDeal: { discountPct, claim } })
          under the per-unit Redis lock, in ONE db transaction:
            1. availability pre-check (409 UNIT_UNAVAILABLE if taken)
            2. claim(client):  UPDATE flash_deals SET quantity_claimed += 1
                               WHERE id=$1 AND status='ACTIVE'
                                 AND quantity_claimed < quantity_total
                               RETURNING quantity_claimed     (0 rows ⇒ SOLD_OUT)
            3. insertHold(... flash_deal_id, discounted quote)
          COMMIT — or ROLL BACK all three together
```

Two failure modes, both clean:
- **Sold out** — the atomic `UPDATE` returns 0 rows; concurrent claims
  serialize on the deal's row lock, so over-claiming is impossible. Proven
  live: 6 simultaneous claims on a `quantity_total = 3` deal ⇒ exactly 3 win,
  3 get `FLASH_DEAL_SOLD_OUT`, counter never exceeds 3, status auto-flips to
  `SOLD_OUT` (the migration-0008 trigger).
- **Window taken** — the booking insert hits the exclusion constraint (23P01);
  the whole transaction rolls back, so **no deal slot is consumed** by a
  failed booking. Proven live.

Because units are quantity-1 resources, a `quantity_total > 1` deal is claimed
by different guests for different (non-overlapping) windows — the exclusion
constraint still guarantees no double-booking on any single window.

## Pricing

`PricingService.quote(..., { discountPct })` records the original base as the
struck-through price and computes the discount off it; fees, VAT, commission
and host payout are all computed on the **net** base, so the deal is a real
discount, not cosmetic. The result still satisfies the DB money CHECK
(`total = base + cleaning + service + taxes − discount`).

## Lifecycle & real-time

- A repeatable BullMQ job (`deals` queue, every 30s) promotes `SCHEDULED →
  ACTIVE` at window open and `ACTIVE/SCHEDULED → ENDED` at window close
  (idempotent, status-guarded, deduped across pods). The DB `SOLD_OUT` flip is
  independent.
- `DealEventsPublisher` publishes `DEAL_ACTIVATED / DEAL_CLAIMED /
  DEAL_SOLD_OUT / DEAL_ENDED` on `lc.events.deals`; the WebSocket gateway
  relays them alongside availability events, so live countdowns and sold-out
  flips reach every device sub-second.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /deals/active` | public | Live claimable feed (+ countdown seed) |
| `POST /deals` | HOST/ADMIN | Create a deal |
| `POST /deals/{id}/claim` | guest, rate-limited 20/min | Claim → discounted hold |

## Verified

`npm run smoke:deals` — 11/11 live: concurrency burst (3 winners / 3 sold-out),
counter bound, SOLD_OUT auto-flip, discount correctness on the booking,
sold-out rejection, atomic no-phantom-slot on a taken window, active-feed
filtering, and the lifecycle sweep. Plus 2 discount unit tests in
`test/pricing.service.spec.ts`. Web: live deal strip on `/discover`.
