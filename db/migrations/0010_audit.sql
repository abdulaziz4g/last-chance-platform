-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0010: Immutable audit log
-- Depends on: 0003, and every audited table (0004–0009)
--
-- Every INSERT/UPDATE/DELETE on a critical table writes a full before/after
-- snapshot here. Immutability is enforced twice: trigger (LC403) for
-- everyone, and privilege revocation for the app role (0012).
-- ============================================================================

CREATE TABLE audit_log (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    schema_name    text NOT NULL,
    table_name     text NOT NULL,
    record_pk      text NOT NULL,
    action         text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    actor_type     actor_type NOT NULL,
    actor_id       uuid,
    request_id     text,
    old_data       jsonb,
    new_data       jsonb,
    changed_fields text[]
);

-- Time-ordered append-only stream: BRIN is ~1000x smaller than btree here.
CREATE INDEX brin_audit_occurred ON audit_log USING brin (occurred_at);
CREATE INDEX idx_audit_record ON audit_log (table_name, record_pk);
CREATE INDEX idx_audit_actor ON audit_log (actor_id) WHERE actor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Generic row-audit trigger. Sensitive columns are stripped before snapshot
-- (password_hash must never appear in audit history).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_old     jsonb;
    v_new     jsonb;
    v_changed text[];
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := to_jsonb(OLD) - 'password_hash';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := to_jsonb(NEW) - 'password_hash';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(o.key) INTO v_changed
        FROM jsonb_each(v_old) AS o
        WHERE (v_new -> o.key) IS DISTINCT FROM o.value;
    END IF;

    INSERT INTO audit_log
        (schema_name, table_name, record_pk, action,
         actor_type, actor_id, request_id,
         old_data, new_data, changed_fields)
    VALUES
        (TG_TABLE_SCHEMA, TG_TABLE_NAME,
         COALESCE(v_new ->> 'id', v_old ->> 'id',
                  v_new ->> 'user_id', v_old ->> 'user_id', '?'),  -- host_profiles PK is user_id
         TG_OP,
         fn_current_actor_type(), fn_current_actor_id(), fn_current_request_id(),
         v_old, v_new, v_changed);

    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Attach auditing to every business-critical table.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_host_profiles
    AFTER INSERT OR UPDATE OR DELETE ON host_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_properties
    AFTER INSERT OR UPDATE OR DELETE ON properties
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_units
    AFTER INSERT OR UPDATE OR DELETE ON units
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_blocks
    AFTER INSERT OR UPDATE OR DELETE ON unit_availability_blocks
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_bookings
    AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_payments
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_refunds
    AFTER INSERT OR UPDATE OR DELETE ON refunds
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_payouts
    AFTER INSERT OR UPDATE OR DELETE ON payouts
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER trg_audit_flash_deals
    AFTER INSERT OR UPDATE OR DELETE ON flash_deals
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ---------------------------------------------------------------------------
-- Append-only enforcement on the immutable tables themselves.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION fn_forbid_mutation();

CREATE TRIGGER trg_booking_history_immutable
    BEFORE UPDATE OR DELETE ON booking_status_history
    FOR EACH ROW EXECUTE FUNCTION fn_forbid_mutation();

CREATE TRIGGER trg_ledger_immutable
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION fn_forbid_mutation();
