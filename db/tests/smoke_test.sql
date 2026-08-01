-- ============================================================================
-- Last Chance Platform — Phase 1 smoke test
-- Exercises every engine-level guarantee, then rolls everything back.
-- Run:  docker exec -i lastchance-postgres psql -q -v ON_ERROR_STOP=1 \
--         -U lastchance -d lastchance -f /db-tests/smoke_test.sql
-- Any uncaught error aborts with a non-zero exit code; success prints PASS
-- notices and "ALL SMOKE TESTS PASSED".
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('app.actor_type', 'SYSTEM', true);

-- Ledger balance checks fire per-statement instead of at COMMIT so we can
-- assert on them inside this transaction.
SET CONSTRAINTS ALL IMMEDIATE;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO users (id, email, full_name, auth_provider) VALUES
    ('00000000-0000-0000-0000-00000000aa01', 'guest@test.local', 'Test Guest', 'google'),
    ('00000000-0000-0000-0000-00000000aa02', 'host@test.local',  'Test Host',  'google');

INSERT INTO host_profiles (user_id, display_name)
VALUES ('00000000-0000-0000-0000-00000000aa02', 'Test Host');

INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location)
VALUES ('00000000-0000-0000-0000-00000000bb01',
        '00000000-0000-0000-0000-00000000aa02',
        'Test Property', 'test-property', 'APARTMENT', 'ACTIVE', 'Riyadh', 'SA',
        ST_SetSRID(ST_MakePoint(46.675, 24.713), 4326)::geography);

INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                   max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                   turnaround_minutes, status)
VALUES ('00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000bb01',
        'Studio 1', 'STUDIO', true, true, 2, 'SAR', 30000, 8000, 30, 'ACTIVE');

-- Booking A: hourly, 2026-08-01 10:00 -> 14:00 UTC (+30 min buffer -> blocks to 14:30)
INSERT INTO bookings (id, guest_id, unit_id, property_id, booking_type, status,
                      check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                      currency, base_amount_minor, total_amount_minor,
                      commission_pct, commission_minor, host_payout_minor)
VALUES ('00000000-0000-0000-0000-00000000dd01',
        '00000000-0000-0000-0000-00000000aa01',
        '00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000bb01',
        'HOURLY', 'PENDING_PAYMENT',
        '2026-08-01 10:00:00+00', '2026-08-01 14:00:00+00', 30, now() + interval '10 minutes',
        'SAR', 32000, 32000, 15.00, 4800, 27200);

-- ---------------------------------------------------------------------------
-- TEST 1: hard overlap is rejected by the EXCLUDE constraint (SQLSTATE 23P01)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO bookings (guest_id, unit_id, property_id, booking_type, status,
                              check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                              currency, base_amount_minor, total_amount_minor,
                              commission_pct, commission_minor, host_payout_minor)
        VALUES ('00000000-0000-0000-0000-00000000aa01',
                '00000000-0000-0000-0000-00000000cc01',
                '00000000-0000-0000-0000-00000000bb01',
                'HOURLY', 'PENDING_PAYMENT',
                '2026-08-01 13:00:00+00', '2026-08-01 15:00:00+00', 30, now() + interval '10 minutes',
                'SAR', 16000, 16000, 15.00, 2400, 13600);
        RAISE EXCEPTION 'TEST 1 FAILED: overlapping booking was accepted';
    EXCEPTION WHEN exclusion_violation THEN
        RAISE NOTICE 'PASS 1: hard overlap rejected (23P01)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 2: the turnaround buffer blocks too — 14:15 start vs 14:30 buffer end
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO bookings (guest_id, unit_id, property_id, booking_type, status,
                              check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                              currency, base_amount_minor, total_amount_minor,
                              commission_pct, commission_minor, host_payout_minor)
        VALUES ('00000000-0000-0000-0000-00000000aa01',
                '00000000-0000-0000-0000-00000000cc01',
                '00000000-0000-0000-0000-00000000bb01',
                'HOURLY', 'PENDING_PAYMENT',
                '2026-08-01 14:15:00+00', '2026-08-01 16:00:00+00', 30, now() + interval '10 minutes',
                'SAR', 16000, 16000, 15.00, 2400, 13600);
        RAISE EXCEPTION 'TEST 2 FAILED: booking inside the turnaround buffer was accepted';
    EXCEPTION WHEN exclusion_violation THEN
        RAISE NOTICE 'PASS 2: turnaround buffer enforced (23P01)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 3: exact buffer boundary is legal (half-open ranges) — 14:30 start OK
-- ---------------------------------------------------------------------------
INSERT INTO bookings (id, guest_id, unit_id, property_id, booking_type, status,
                      check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                      currency, base_amount_minor, total_amount_minor,
                      commission_pct, commission_minor, host_payout_minor)
VALUES ('00000000-0000-0000-0000-00000000dd04',
        '00000000-0000-0000-0000-00000000aa01',
        '00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000bb01',
        'HOURLY', 'PENDING_PAYMENT',
        '2026-08-01 14:30:00+00', '2026-08-01 16:00:00+00', 30, now() + interval '10 minutes',
        'SAR', 12000, 12000, 15.00, 1800, 10200);
DO $$ BEGIN RAISE NOTICE 'PASS 3: back-to-back booking at buffer boundary accepted'; END $$;

-- Booking A: payment captured
UPDATE bookings SET status = 'CONFIRMED'
WHERE id = '00000000-0000-0000-0000-00000000dd01';

-- ---------------------------------------------------------------------------
-- TEST 4: illegal FSM transition rejected (PENDING_PAYMENT -> CHECKED_IN
-- skips payment entirely).
--
-- This test used to assert CONFIRMED -> COMPLETED was illegal. Migration 0015
-- legalises that edge, because gating COMPLETED solely on CHECKED_IN stranded
-- every no-show booking's escrow (see TEST 13). Retargeted to a transition
-- that stays illegal and preserves the original intent: you cannot skip a
-- required step — here, paying.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        UPDATE bookings SET status = 'CHECKED_IN'
        WHERE id = '00000000-0000-0000-0000-00000000dd04';
        RAISE EXCEPTION 'TEST 4 FAILED: illegal FSM transition was accepted';
    EXCEPTION WHEN SQLSTATE 'LC400' THEN
        RAISE NOTICE 'PASS 4: illegal FSM transition rejected (LC400)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 5: host block overlapping an active booking rejected (LC409)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO unit_availability_blocks (unit_id, block_type, block_range)
        VALUES ('00000000-0000-0000-0000-00000000cc01', 'HOST_BLOCK',
                tstzrange('2026-08-01 11:00:00+00', '2026-08-01 12:00:00+00', '[)'));
        RAISE EXCEPTION 'TEST 5 FAILED: block over an active booking was accepted';
    EXCEPTION WHEN SQLSTATE 'LC409' THEN
        RAISE NOTICE 'PASS 5: host block vs booking conflict rejected (LC409)';
    END;
END $$;

-- Non-conflicting block on the next day is fine.
INSERT INTO unit_availability_blocks (id, unit_id, block_type, block_range)
VALUES ('00000000-0000-0000-0000-00000000ee02',
        '00000000-0000-0000-0000-00000000cc01', 'MAINTENANCE',
        tstzrange('2026-08-02 10:00:00+00', '2026-08-02 12:00:00+00', '[)'));

-- ---------------------------------------------------------------------------
-- TEST 6: booking overlapping a host block rejected (LC409, reverse direction)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO bookings (guest_id, unit_id, property_id, booking_type, status,
                              check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                              currency, base_amount_minor, total_amount_minor,
                              commission_pct, commission_minor, host_payout_minor)
        VALUES ('00000000-0000-0000-0000-00000000aa01',
                '00000000-0000-0000-0000-00000000cc01',
                '00000000-0000-0000-0000-00000000bb01',
                'HOURLY', 'PENDING_PAYMENT',
                '2026-08-02 10:30:00+00', '2026-08-02 11:30:00+00', 30, now() + interval '10 minutes',
                'SAR', 8000, 8000, 15.00, 1200, 6800);
        RAISE EXCEPTION 'TEST 6 FAILED: booking over a host block was accepted';
    EXCEPTION WHEN SQLSTATE 'LC409' THEN
        RAISE NOTICE 'PASS 6: booking vs host block conflict rejected (LC409)';
    END;
END $$;

-- Legal FSM path completes.
UPDATE bookings SET status = 'CHECKED_IN'
WHERE id = '00000000-0000-0000-0000-00000000dd01';
UPDATE bookings SET status = 'COMPLETED'
WHERE id = '00000000-0000-0000-0000-00000000dd01';
DO $$ BEGIN RAISE NOTICE 'PASS 7: legal FSM path CONFIRMED->CHECKED_IN->COMPLETED accepted'; END $$;

-- ---------------------------------------------------------------------------
-- TEST 8: stale-hold sweeper flips lapsed PENDING_PAYMENT to EXPIRED
-- ---------------------------------------------------------------------------
INSERT INTO bookings (id, guest_id, unit_id, property_id, booking_type, status,
                      check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                      currency, base_amount_minor, total_amount_minor,
                      commission_pct, commission_minor, host_payout_minor)
VALUES ('00000000-0000-0000-0000-00000000dd06',
        '00000000-0000-0000-0000-00000000aa01',
        '00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000bb01',
        'HOURLY', 'PENDING_PAYMENT',
        '2026-08-03 10:00:00+00', '2026-08-03 12:00:00+00', 30, now() - interval '1 minute',
        'SAR', 16000, 16000, 15.00, 2400, 13600);

DO $$
DECLARE
    v_status booking_status;
BEGIN
    PERFORM fn_expire_stale_holds();
    SELECT status INTO v_status FROM bookings
    WHERE id = '00000000-0000-0000-0000-00000000dd06';
    IF v_status <> 'EXPIRED' THEN
        RAISE EXCEPTION 'TEST 8 FAILED: stale hold not expired (status %)', v_status;
    END IF;
    RAISE NOTICE 'PASS 8: stale hold swept to EXPIRED';
END $$;

-- ---------------------------------------------------------------------------
-- TEST 9: balanced ledger group accepted; unbalanced group rejected (LC422)
-- ---------------------------------------------------------------------------
INSERT INTO ledger_entries (entry_group_id, account, direction, amount_minor, currency,
                            booking_id, description)
VALUES ('00000000-0000-0000-0000-00000000ff01', 'PROVIDER_CLEARING', 'DEBIT',  32000, 'SAR',
        '00000000-0000-0000-0000-00000000dd01', 'Capture: funds at PSP'),
       ('00000000-0000-0000-0000-00000000ff01', 'PLATFORM_ESCROW',   'CREDIT', 32000, 'SAR',
        '00000000-0000-0000-0000-00000000dd01', 'Capture: escrow liability');
DO $$ BEGIN RAISE NOTICE 'PASS 9a: balanced ledger group accepted'; END $$;

DO $$
BEGIN
    BEGIN
        INSERT INTO ledger_entries (entry_group_id, account, direction, amount_minor, currency,
                                    description)
        VALUES ('00000000-0000-0000-0000-00000000ff02', 'PLATFORM_ESCROW', 'DEBIT', 100, 'SAR',
                'lonely unbalanced leg');
        RAISE EXCEPTION 'TEST 9b FAILED: unbalanced ledger group was accepted';
    EXCEPTION WHEN SQLSTATE 'LC422' THEN
        RAISE NOTICE 'PASS 9b: unbalanced ledger group rejected (LC422)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 10: append-only history cannot be tampered with (LC403)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        UPDATE booking_status_history SET reason = 'tamper'
        WHERE booking_id = '00000000-0000-0000-0000-00000000dd01';
        RAISE EXCEPTION 'TEST 10 FAILED: history row was mutated';
    EXCEPTION WHEN SQLSTATE 'LC403' THEN
        RAISE NOTICE 'PASS 10: booking_status_history is append-only (LC403)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 11: audit log captured the activity
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count FROM audit_log WHERE table_name = 'bookings';
    IF v_count < 5 THEN
        RAISE EXCEPTION 'TEST 11 FAILED: expected >=5 booking audit rows, got %', v_count;
    END IF;
    RAISE NOTICE 'PASS 11: audit log recorded % booking events', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 12: review eligibility — completed stay reviewable, pending stay not
-- ---------------------------------------------------------------------------
INSERT INTO reviews (booking_id, property_id, author_id, overall_rating, comment)
VALUES ('00000000-0000-0000-0000-00000000dd01',
        '00000000-0000-0000-0000-00000000bb01',
        '00000000-0000-0000-0000-00000000aa01', 5, 'Spotless, seamless hourly stay.');
UPDATE reviews SET status = 'PUBLISHED'
WHERE booking_id = '00000000-0000-0000-0000-00000000dd01';

DO $$
DECLARE
    v_avg numeric;
    v_cnt integer;
BEGIN
    SELECT rating_avg, rating_count INTO v_avg, v_cnt
    FROM properties WHERE id = '00000000-0000-0000-0000-00000000bb01';
    IF v_avg IS DISTINCT FROM 5.00 OR v_cnt <> 1 THEN
        RAISE EXCEPTION 'TEST 12a FAILED: aggregates avg=% count=%', v_avg, v_cnt;
    END IF;
    RAISE NOTICE 'PASS 12a: review published, property aggregates updated (5.00 / 1)';

    BEGIN
        INSERT INTO reviews (booking_id, property_id, author_id, overall_rating)
        VALUES ('00000000-0000-0000-0000-00000000dd04',
                '00000000-0000-0000-0000-00000000bb01',
                '00000000-0000-0000-0000-00000000aa01', 4);
        RAISE EXCEPTION 'TEST 12b FAILED: review of a non-completed stay was accepted';
    EXCEPTION WHEN SQLSTATE 'LC400' THEN
        RAISE NOTICE 'PASS 12b: review of non-completed stay rejected (LC400)';
    END;
END $$;

-- ===========================================================================
-- Migration 0015 — FSM completeness, exact money split, currency coherence
-- ===========================================================================

-- Booking B: a clean SAR stay on a free window, used by tests 13 and 16.
INSERT INTO bookings (id, guest_id, unit_id, property_id, booking_type, status,
                      check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                      currency, base_amount_minor, total_amount_minor,
                      commission_pct, commission_minor, host_payout_minor)
VALUES ('00000000-0000-0000-0000-00000000dd07',
        '00000000-0000-0000-0000-00000000aa01',
        '00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000bb01',
        'HOURLY', 'PENDING_PAYMENT',
        '2026-08-05 10:00:00+00', '2026-08-05 12:00:00+00', 30, now() + interval '10 minutes',
        'SAR', 20000, 20000, 15.00, 3000, 17000);

-- ---------------------------------------------------------------------------
-- TEST 13 (F1): a no-show settles. CONFIRMED -> COMPLETED without ever
-- passing through CHECKED_IN, so escrow can be released for a guest who
-- never showed up. Before 0015 this raised LC400 and the money was stuck.
-- ---------------------------------------------------------------------------
UPDATE bookings SET status = 'CONFIRMED'
WHERE id = '00000000-0000-0000-0000-00000000dd07';
UPDATE bookings SET status = 'COMPLETED'
WHERE id = '00000000-0000-0000-0000-00000000dd07';
DO $$
DECLARE
    v_status booking_status;
BEGIN
    SELECT status INTO v_status FROM bookings
    WHERE id = '00000000-0000-0000-0000-00000000dd07';
    IF v_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'TEST 13 FAILED: no-show did not reach COMPLETED (status %)', v_status;
    END IF;
    RAISE NOTICE 'PASS 13: no-show path CONFIRMED->COMPLETED accepted (escrow releasable)';
END $$;

-- ---------------------------------------------------------------------------
-- TEST 14 (F1): a stay can be terminated mid-occupancy.
-- CHECKED_IN -> CANCELLED, then on to REFUNDED via the pre-existing edge.
-- ---------------------------------------------------------------------------
INSERT INTO bookings (id, guest_id, unit_id, property_id, booking_type, status,
                      check_in_utc, check_out_utc, turnaround_minutes, hold_expires_at,
                      currency, base_amount_minor, total_amount_minor,
                      commission_pct, commission_minor, host_payout_minor)
VALUES ('00000000-0000-0000-0000-00000000dd08',
        '00000000-0000-0000-0000-00000000aa01',
        '00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000bb01',
        'HOURLY', 'PENDING_PAYMENT',
        '2026-08-06 10:00:00+00', '2026-08-06 12:00:00+00', 30, now() + interval '10 minutes',
        'SAR', 20000, 20000, 15.00, 3000, 17000);

UPDATE bookings SET status = 'CONFIRMED'  WHERE id = '00000000-0000-0000-0000-00000000dd08';
UPDATE bookings SET status = 'CHECKED_IN' WHERE id = '00000000-0000-0000-0000-00000000dd08';
UPDATE bookings SET status = 'CANCELLED', cancellation_reason = 'Emergency maintenance'
WHERE id = '00000000-0000-0000-0000-00000000dd08';
UPDATE bookings SET status = 'REFUNDED'   WHERE id = '00000000-0000-0000-0000-00000000dd08';
DO $$ BEGIN RAISE NOTICE 'PASS 14: mid-stay path CHECKED_IN->CANCELLED->REFUNDED accepted'; END $$;

-- ---------------------------------------------------------------------------
-- TEST 15 (F3): the split is an identity.
--   15a — a discounted booking whose split is exact is accepted. These are
--         real PricingService numbers: base 20000, 20% off -> net 16000,
--         service 3% = 480, VAT 15% on (16000+480) = 2472,
--         total = 20000 + 480 + 2472 - 4000 = 18952,
--         commission 15% of net = 2400, payout = 16000 - 2400 = 13600.
--   15b — a short-paid host is rejected. Under the old `<=` constraint this
--         exact row committed, leaving 19800 minor units unaccounted for.
-- ---------------------------------------------------------------------------
INSERT INTO bookings (id, guest_id, unit_id, property_id, booking_type, status,
                      check_in_utc, check_out_utc, turnaround_minutes,
                      currency, base_amount_minor, service_fee_minor, taxes_minor,
                      discount_minor, total_amount_minor,
                      commission_pct, commission_minor, host_payout_minor)
VALUES ('00000000-0000-0000-0000-00000000dd09',
        '00000000-0000-0000-0000-00000000aa01',
        '00000000-0000-0000-0000-00000000cc01',
        '00000000-0000-0000-0000-00000000bb01',
        'HOURLY', 'DRAFT',
        '2026-08-07 10:00:00+00', '2026-08-07 12:00:00+00', 30,
        'SAR', 20000, 480, 2472, 4000, 18952, 15.00, 2400, 13600);
DO $$ BEGIN RAISE NOTICE 'PASS 15a: exact split on a discounted booking accepted'; END $$;

DO $$
BEGIN
    BEGIN
        INSERT INTO bookings (guest_id, unit_id, property_id, booking_type, status,
                              check_in_utc, check_out_utc, turnaround_minutes,
                              currency, base_amount_minor, total_amount_minor,
                              commission_pct, commission_minor, host_payout_minor)
        VALUES ('00000000-0000-0000-0000-00000000aa01',
                '00000000-0000-0000-0000-00000000cc01',
                '00000000-0000-0000-0000-00000000bb01',
                'HOURLY', 'DRAFT',
                '2026-08-08 10:00:00+00', '2026-08-08 12:00:00+00', 30,
                'SAR', 20000, 20000, 15.00, 100, 100);
        RAISE EXCEPTION 'TEST 15b FAILED: a booking that shorted the host was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS 15b: short-paid split rejected (check_violation)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 16 (F4): a payment must settle in its booking's currency.
--   16a — matching currency accepted.
--   16b — mismatched currency rejected by the composite FK. Before 0015 a
--         1-yen payment could settle a 200-riyal booking.
-- ---------------------------------------------------------------------------
INSERT INTO payments (id, booking_id, provider, method, idempotency_key,
                      amount_minor, currency)
VALUES ('00000000-0000-0000-0000-0000000f0001',
        '00000000-0000-0000-0000-00000000dd07',
        'MOCK', 'MADA', 'smoke-idem-0015-a', 20000, 'SAR');
DO $$ BEGIN RAISE NOTICE 'PASS 16a: payment in the booking currency accepted'; END $$;

DO $$
BEGIN
    BEGIN
        INSERT INTO payments (booking_id, provider, method, idempotency_key,
                              amount_minor, currency)
        VALUES ('00000000-0000-0000-0000-00000000dd07',
                'MOCK', 'VISA', 'smoke-idem-0015-b', 1, 'JPY');
        RAISE EXCEPTION 'TEST 16b FAILED: cross-currency payment was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'PASS 16b: cross-currency payment rejected (23503)';
    END;
END $$;

-- 16c — the same guarantee one level down: a refund cannot change currency
-- mid-flight away from the payment it reverses.
DO $$
BEGIN
    BEGIN
        INSERT INTO refunds (payment_id, amount_minor, currency, reason)
        VALUES ('00000000-0000-0000-0000-0000000f0001', 500, 'USD', 'partial goodwill');
        RAISE EXCEPTION 'TEST 16c FAILED: cross-currency refund was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'PASS 16c: cross-currency refund rejected (23503)';
    END;
END $$;

DO $$ BEGIN RAISE NOTICE '=== ALL SMOKE TESTS PASSED ==='; END $$;

ROLLBACK;
