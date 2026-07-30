-- ============================================================================
-- Last Chance Platform — Phase 1 hardening
-- Migration 0015: FSM completeness, exact money split, currency coherence
-- Depends on: 0006 (bookings + FSM), 0007 (payments/refunds/payouts)
--
-- Closes three gaps found reviewing 0001–0014 against the Phase 1 spec:
--
--   F1  A stay that never checked in could never reach COMPLETED, so escrow
--       could never be released — guest funds stranded, host never paid.
--   F3  The split invariant was an inequality, so a booking that paid the host
--       0.4% of what it owed committed without complaint.
--   F4  A payment's currency bore no relation to the booking it settled.
--
-- Like 0001–0014 this migration assumes single application: there is still no
-- schema_migrations ledger (tracked separately), so re-running the script from
-- scratch against an already-migrated database will fail here as it does at
-- 0002. The FSM insert below is the one idempotent statement.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- F1 — FSM completeness.
--
-- COMPLETED was reachable only via CHECKED_IN, and escrow release
-- (PayoutService.createForBooking) gates on status = 'COMPLETED'. Any stay
-- where nobody performed check-in — no-show, unattended hourly access, a
-- check-in call that failed — was therefore permanently unpayable AND
-- unreviewable, with the guest's money parked in PLATFORM_ESCROW and no legal
-- transition out. For hourly micro-stays, where check-in is precisely the step
-- most likely to be skipped, that is the default path, not the edge case.
--
-- CHECKED_IN likewise had exactly one exit, so a stay could not be terminated
-- mid-occupancy (eviction, emergency, host-side cancellation).
--
-- Adding the edge makes settlement POSSIBLE, not automatic: what a no-show
-- actually pays out remains a cancellation-policy decision in the service
-- layer. The database's job is to not paint that decision into a corner.
--
-- No application change is required. BookingFsmEngine loads this table at
-- boot (booking-fsm.engine.ts), so the in-process whitelist and the LC400
-- trigger pick up the new edges together — the payoff of FSM-as-data.
-- ---------------------------------------------------------------------------
INSERT INTO booking_fsm_transitions (from_status, to_status, description) VALUES
    ('CONFIRMED',  'COMPLETED',
     'Stay window elapsed without check-in (no-show / unattended access); escrow settles per policy'),
    ('CHECKED_IN', 'CANCELLED',
     'Stay terminated mid-occupancy (eviction, emergency, host cancellation)')
ON CONFLICT (from_status, to_status) DO NOTHING;

-- ---------------------------------------------------------------------------
-- F3 — the money split becomes an identity, not an inequality.
--
-- Old constraint: commission_minor + host_payout_minor <= total_amount_minor.
-- A booking with total = 50000, commission = 100, host_payout = 100 satisfied
-- it, leaving 49800 minor units unaccounted for and the host short by 99.6%.
--
-- The exact relation, read off PricingService.quote():
--
--     net_base    = base_amount_minor - discount_minor
--     commission  = round(net_base * commission_pct / 100)
--     host_payout = net_base - commission
--  => commission + host_payout = base_amount_minor - discount_minor   (exact)
--
-- Cleaning fee, service fee and VAT are deliberately NOT part of this identity.
-- They are not folded into host_payout_minor; they settle as separate ledger
-- legs at payout time (HOST_PAYABLE / PLATFORM_REVENUE / TAX_PAYABLE). Keeping
-- them out is what makes the identity exact rather than approximate.
--
-- The old inequality is implied by the new one — cleaning, service and taxes
-- are all non-negative, so commission + payout = base - discount <= total —
-- meaning nothing is lost by replacing it.
--
-- Checked against the current database before writing: 115 bookings, 0
-- violations, 29 of them carrying a discount.
--
-- NOT VALID + VALIDATE is deliberate: the second step takes a weaker lock than
-- a single ADD CONSTRAINT, so the table stays writable during the scan.
-- ---------------------------------------------------------------------------
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_split_consistency;

ALTER TABLE bookings ADD CONSTRAINT bookings_split_exact CHECK (
    commission_minor + host_payout_minor = base_amount_minor - discount_minor
) NOT VALID;

ALTER TABLE bookings VALIDATE CONSTRAINT bookings_split_exact;

-- ---------------------------------------------------------------------------
-- F4 — currency coherence, enforced declaratively.
--
-- payments.currency had no relationship to the booking it settles: a JPY 1
-- payment could settle a USD 500 booking and both rows were valid. Same for a
-- refund against its payment, and a payout against its booking.
--
-- Composite foreign keys rather than triggers — the same idiom bookings
-- already uses for (unit_id, property_id) in 0006. A FK cannot be forgotten,
-- bypassed by a direct psql session, or skipped by a future service; a trigger
-- is only as good as the next person who reads it.
--
-- Cost: each UNIQUE below builds an index that mostly duplicates the primary
-- key. That is the price of a declarative guarantee and it is worth paying.
-- On a large production table, create these indexes CONCURRENTLY first and
-- attach them with ADD CONSTRAINT ... USING INDEX to avoid the write lock.
-- ---------------------------------------------------------------------------
ALTER TABLE bookings ADD CONSTRAINT bookings_id_currency_unique UNIQUE (id, currency);
ALTER TABLE payments ADD CONSTRAINT payments_id_currency_unique UNIQUE (id, currency);

ALTER TABLE payments
    ADD CONSTRAINT payments_booking_currency_fk
    FOREIGN KEY (booking_id, currency) REFERENCES bookings (id, currency) NOT VALID;
ALTER TABLE payments VALIDATE CONSTRAINT payments_booking_currency_fk;

ALTER TABLE refunds
    ADD CONSTRAINT refunds_payment_currency_fk
    FOREIGN KEY (payment_id, currency) REFERENCES payments (id, currency) NOT VALID;
ALTER TABLE refunds VALIDATE CONSTRAINT refunds_payment_currency_fk;

-- Payouts settle in the booking's currency today (PayoutService passes
-- booking.currency straight through), and the ledger already forbids mixing
-- currencies inside an entry group — so this constraint documents an invariant
-- that already holds rather than imposing a new one.
--
-- FORWARD NOTE: host_profiles.payout_currency exists and is currently unused.
-- Paying a host in a currency other than the booking's is an FX feature, not a
-- constraint relaxation: it needs an explicit rate, a rate timestamp, and its
-- own ledger legs. Whoever builds that must revisit this constraint
-- deliberately — which is exactly why it is here.
ALTER TABLE payouts
    ADD CONSTRAINT payouts_booking_currency_fk
    FOREIGN KEY (booking_id, currency) REFERENCES bookings (id, currency) NOT VALID;
ALTER TABLE payouts VALIDATE CONSTRAINT payouts_booking_currency_fk;
