-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0006: Bookings — overlap guard, FSM engine, status history
-- Depends on: 0003, 0004, 0005
--
-- This is the correctness core of the platform. Three engine-level guarantees:
--   1. Double-booking is physically impossible (GIST EXCLUDE constraint).
--   2. Only whitelisted FSM transitions can occur (trigger + transition table).
--   3. Every transition is recorded in an append-only history table.
-- ============================================================================

CREATE TABLE bookings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code        text NOT NULL UNIQUE DEFAULT fn_generate_booking_code(),

    guest_id            uuid NOT NULL REFERENCES users (id),
    unit_id             uuid NOT NULL,
    property_id         uuid NOT NULL,

    booking_type        booking_type NOT NULL,
    status              booking_status NOT NULL DEFAULT 'DRAFT',
    source              booking_source NOT NULL DEFAULT 'WEB',

    -- Temporal core. Always UTC instants; property-local display is app-side.
    check_in_utc        timestamptz NOT NULL,
    check_out_utc       timestamptz NOT NULL,
    -- Snapshot of units.turnaround_minutes at creation: a host changing the
    -- buffer later must never retroactively alter existing bookings.
    turnaround_minutes  integer NOT NULL DEFAULT 30
                        CHECK (turnaround_minutes BETWEEN 0 AND 240),
    -- Guest window + cleaning buffer: the column the exclusion constraint
    -- arbitrates. Half-open [) so back-to-back stays at the boundary are legal.
    block_range         tstzrange GENERATED ALWAYS AS (
                            fn_booking_block_range(check_in_utc, check_out_utc, turnaround_minutes)
                        ) STORED,

    guests_count        smallint NOT NULL DEFAULT 1 CHECK (guests_count > 0),

    -- Deadline of the 10-minute payment hold. Redis mirrors this for speed;
    -- THIS column is the durable truth that survives any Redis failure.
    hold_expires_at     timestamptz,

    -- Money snapshot (immutable once past DRAFT). Integer minor units only.
    currency            currency_code NOT NULL,
    base_amount_minor   money_minor NOT NULL,
    cleaning_fee_minor  money_minor NOT NULL DEFAULT 0,
    service_fee_minor   money_minor NOT NULL DEFAULT 0,
    taxes_minor         money_minor NOT NULL DEFAULT 0,
    discount_minor      money_minor NOT NULL DEFAULT 0,
    total_amount_minor  money_minor NOT NULL,
    commission_pct      percentage NOT NULL,
    commission_minor    money_minor NOT NULL,
    host_payout_minor   money_minor NOT NULL,

    -- FK added in 0008 (flash_deals is created there).
    flash_deal_id       uuid,

    cancelled_at        timestamptz,
    cancelled_by        actor_type,
    cancellation_reason text,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT bookings_valid_window CHECK (check_out_utc > check_in_utc),
    CONSTRAINT bookings_price_consistency CHECK (
        total_amount_minor = base_amount_minor + cleaning_fee_minor
                           + service_fee_minor + taxes_minor - discount_minor
    ),
    CONSTRAINT bookings_split_consistency CHECK (
        commission_minor + host_payout_minor <= total_amount_minor
    ),
    CONSTRAINT bookings_hold_required CHECK (
        status <> 'PENDING_PAYMENT' OR hold_expires_at IS NOT NULL
    ),
    -- Composite FK: property_id can never disagree with the unit's property.
    CONSTRAINT bookings_unit_property_fk FOREIGN KEY (unit_id, property_id)
        REFERENCES units (id, property_id),

    -- ========================================================================
    -- THE OVERLAP GUARD.
    -- Two transactions inserting overlapping ranges for the same unit cannot
    -- both commit: the GIST index arbitrates and the loser receives SQLSTATE
    -- 23P01 (exclusion_violation), which the API maps to 409 UNIT_UNAVAILABLE.
    -- Partial (WHERE): only inventory-holding states block; releasing a hold
    -- is a pure status flip — never a DELETE.
    -- ========================================================================
    CONSTRAINT bookings_no_double_booking EXCLUDE USING gist (
        unit_id     WITH =,
        block_range WITH &&
    ) WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'))
);

CREATE TRIGGER trg_bookings_touch
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- FSM definition: the single source of truth for legal transitions.
-- Data, not code — auditable, queryable, and shared with the NestJS FSM
-- engine (Phase 2 loads this table at boot and must agree with it).
-- ---------------------------------------------------------------------------
CREATE TABLE booking_fsm_transitions (
    from_status booking_status NOT NULL,
    to_status   booking_status NOT NULL,
    description text NOT NULL,
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO booking_fsm_transitions (from_status, to_status, description) VALUES
    ('DRAFT',           'PENDING_PAYMENT', 'Guest starts checkout; 10-min hold placed'),
    ('DRAFT',           'CANCELLED',       'Guest abandons draft'),
    ('PENDING_PAYMENT', 'CONFIRMED',       'Payment captured/authorized in escrow'),
    ('PENDING_PAYMENT', 'EXPIRED',         'Hold lapsed without payment (sweeper/BullMQ)'),
    ('PENDING_PAYMENT', 'CANCELLED',       'Guest aborted during payment'),
    ('CONFIRMED',       'CHECKED_IN',      'Guest arrived'),
    ('CONFIRMED',       'CANCELLED',       'Cancellation before check-in (policy applies)'),
    ('CHECKED_IN',      'COMPLETED',       'Stay finished; payout pipeline triggers'),
    ('CANCELLED',       'REFUNDED',        'Refund settled per cancellation policy'),
    ('COMPLETED',       'REFUNDED',        'Post-stay refund (dispute/goodwill)');

-- ---------------------------------------------------------------------------
-- booking_status_history — append-only transition log (immutability enforced
-- in 0010). clock_timestamp() not now(): distinct instants within one tx.
-- ---------------------------------------------------------------------------
CREATE TABLE booking_status_history (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id  uuid NOT NULL REFERENCES bookings (id),
    from_status booking_status,          -- NULL = row creation
    to_status   booking_status NOT NULL,
    actor_type  actor_type NOT NULL,
    actor_id    uuid,
    request_id  text,
    reason      text,
    metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ---------------------------------------------------------------------------
-- Trigger 1 — initial-state guard. Bookings enter the world only as DRAFT or
-- (for instant checkout) directly as PENDING_PAYMENT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_booking_insert_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status NOT IN ('DRAFT', 'PENDING_PAYMENT') THEN
        RAISE EXCEPTION 'Booking must be created as DRAFT or PENDING_PAYMENT, got %', NEW.status
            USING ERRCODE = 'LC402';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_insert_guard
    BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION fn_booking_insert_guard();

-- ---------------------------------------------------------------------------
-- Trigger 2 — FSM enforcement + core-field immutability.
--   LC400: illegal state transition
--   LC401: attempt to mutate immutable fields
-- Date/price changes are allowed only while DRAFT; a confirmed-booking
-- modification is modeled as cancel + rebook (new row), never an edit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_booking_fsm_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT EXISTS (
            SELECT 1 FROM booking_fsm_transitions t
            WHERE t.from_status = OLD.status AND t.to_status = NEW.status
        ) THEN
            RAISE EXCEPTION 'Illegal booking state transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'LC400';
        END IF;
    END IF;

    IF NEW.unit_id     IS DISTINCT FROM OLD.unit_id
    OR NEW.guest_id    IS DISTINCT FROM OLD.guest_id
    OR NEW.property_id IS DISTINCT FROM OLD.property_id THEN
        RAISE EXCEPTION 'Booking unit/guest/property are immutable'
            USING ERRCODE = 'LC401';
    END IF;

    IF OLD.status <> 'DRAFT' AND (
        NEW.check_in_utc       IS DISTINCT FROM OLD.check_in_utc OR
        NEW.check_out_utc      IS DISTINCT FROM OLD.check_out_utc OR
        NEW.turnaround_minutes IS DISTINCT FROM OLD.turnaround_minutes OR
        NEW.total_amount_minor IS DISTINCT FROM OLD.total_amount_minor
    ) THEN
        RAISE EXCEPTION 'Booking dates/amounts are locked after DRAFT (cancel + rebook instead)'
            USING ERRCODE = 'LC401';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_fsm_guard
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION fn_booking_fsm_guard();

-- ---------------------------------------------------------------------------
-- Trigger 3 — transition logging (AFTER, so it sees the committed-to values).
-- Actor context arrives via SET LOCAL app.actor_id / app.actor_type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_booking_log_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO booking_status_history
            (booking_id, from_status, to_status, actor_type, actor_id, request_id)
        VALUES
            (NEW.id, NULL, NEW.status, fn_current_actor_type(), fn_current_actor_id(),
             fn_current_request_id());
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO booking_status_history
            (booking_id, from_status, to_status, actor_type, actor_id, request_id,
             reason)
        VALUES
            (NEW.id, OLD.status, NEW.status, fn_current_actor_type(), fn_current_actor_id(),
             fn_current_request_id(), NEW.cancellation_reason);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_bookings_log_status
    AFTER INSERT OR UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION fn_booking_log_status();

-- ---------------------------------------------------------------------------
-- Cross-calendar guard: bookings vs host availability blocks.
--
-- Same-table overlaps are handled by each table's own EXCLUDE constraint.
-- CROSS-table overlap checks are racy under READ COMMITTED, so both paths
-- first serialize on a per-unit advisory transaction lock — two concurrent
-- writers to one unit's calendar are ordered, and the loser sees the winner's
-- committed row. SQLSTATE LC409 = calendar conflict.
--
-- NOTE: BEFORE-trigger rows do not yet have GENERATED columns computed, so we
-- recompute the block range via fn_booking_block_range — never NEW.block_range.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_booking_check_host_blocks() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_range tstzrange;
BEGIN
    v_range := fn_booking_block_range(NEW.check_in_utc, NEW.check_out_utc, NEW.turnaround_minutes);

    PERFORM pg_advisory_xact_lock(
        hashtextextended('unit_calendar:' || NEW.unit_id::text, 0)
    );

    IF EXISTS (
        SELECT 1 FROM unit_availability_blocks b
        WHERE b.unit_id = NEW.unit_id
          AND b.is_active
          AND b.block_range && v_range
    ) THEN
        RAISE EXCEPTION 'Unit calendar is blocked by the host for the requested window'
            USING ERRCODE = 'LC409';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_check_host_blocks
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW
    WHEN (NEW.status = ANY (ARRAY['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN']::booking_status[]))
    EXECUTE FUNCTION fn_booking_check_host_blocks();

CREATE OR REPLACE FUNCTION fn_block_check_bookings() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('unit_calendar:' || NEW.unit_id::text, 0)
    );

    IF EXISTS (
        SELECT 1 FROM bookings bk
        WHERE bk.unit_id = NEW.unit_id
          AND bk.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
          AND bk.block_range && NEW.block_range
    ) THEN
        RAISE EXCEPTION 'Availability block conflicts with an active booking'
            USING ERRCODE = 'LC409';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_blocks_check_bookings
    BEFORE INSERT OR UPDATE ON unit_availability_blocks
    FOR EACH ROW
    WHEN (NEW.is_active)
    EXECUTE FUNCTION fn_block_check_bookings();

-- ---------------------------------------------------------------------------
-- fn_expire_stale_holds — flips lapsed PENDING_PAYMENT holds to EXPIRED.
-- Called by the BullMQ per-booking delayed job AND the safety-net sweeper
-- cron. Idempotent (status predicate) and contention-free (SKIP LOCKED):
-- a hold confirmed a millisecond earlier is simply not selected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_expire_stale_holds(p_limit integer DEFAULT 500)
RETURNS SETOF uuid
LANGUAGE sql VOLATILE AS $$
    UPDATE bookings
    SET status = 'EXPIRED'
    WHERE id IN (
        SELECT id FROM bookings
        WHERE status = 'PENDING_PAYMENT'
          AND hold_expires_at < now()
        ORDER BY hold_expires_at
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING id;
$$;
