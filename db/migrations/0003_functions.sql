-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0003: Core utility functions
-- Depends on: 0001, 0002
-- ============================================================================

-- ---------------------------------------------------------------------------
-- fn_booking_block_range
--
-- Builds the *blocking* occupancy range for a booking:
--   [check_in, check_out + turnaround_buffer)
--
-- WHY A FUNCTION AND NOT AN INLINE GENERATED EXPRESSION:
-- `timestamptz + interval` is catalogued STABLE (day/month interval arithmetic
-- depends on the session TimeZone GUC across DST boundaries), and generated
-- columns require IMMUTABLE expressions. Adding *minutes* to a timestamptz,
-- however, is pure fixed-epoch arithmetic — timezone-independent and fully
-- deterministic — so this minutes-only wrapper is safe to declare IMMUTABLE.
-- Do NOT generalize this function to day/month intervals.
--
-- Half-open bounds '[)' make back-to-back stays legal: a booking blocking
-- until exactly 14:30 does not conflict with one starting at 14:30.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_booking_block_range(
    p_check_in           timestamptz,
    p_check_out          timestamptz,
    p_turnaround_minutes integer
) RETURNS tstzrange
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT tstzrange(
        p_check_in,
        p_check_out + make_interval(mins => p_turnaround_minutes),
        '[)'
    );
$$;

-- ---------------------------------------------------------------------------
-- fn_generate_booking_code — human-readable reference, e.g. LC-260801-9F3A21BC.
-- Collision probability is negligible (4 random bytes/day); the UNIQUE
-- constraint on bookings.booking_code is the backstop (service retries once).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_booking_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
    SELECT 'LC-'
        || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD')
        || '-'
        || upper(encode(gen_random_bytes(4), 'hex'));
$$;

-- ---------------------------------------------------------------------------
-- Request-context accessors.
--
-- The application layer (NestJS) stamps every transaction with:
--   SET LOCAL app.actor_id   = '<uuid>';
--   SET LOCAL app.actor_type = 'GUEST' | 'HOST' | 'ADMIN' | 'SUPPORT' | 'SYSTEM';
--   SET LOCAL app.request_id = '<trace id>';
-- Triggers read them through these safe accessors (never raise when unset).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_current_actor_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN NULLIF(current_setting('app.actor_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_current_actor_type() RETURNS actor_type
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'SYSTEM')::actor_type;
EXCEPTION WHEN OTHERS THEN
    RETURN 'SYSTEM'::actor_type;
END;
$$;

CREATE OR REPLACE FUNCTION fn_current_request_id() RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.request_id', true), '');
$$;

-- ---------------------------------------------------------------------------
-- fn_touch_updated_at — standard moddatetime trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- fn_forbid_mutation — attach BEFORE UPDATE OR DELETE to append-only tables
-- (audit_log, booking_status_history, ledger_entries).
-- SQLSTATE 'LC403' = append-only violation (custom Last Chance error class).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Table "%" is append-only; % is forbidden', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'LC403';
END;
$$;
