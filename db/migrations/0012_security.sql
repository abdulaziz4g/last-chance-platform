-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0012: Database-role security (defense in depth)
-- Depends on: all previous migrations
--
-- The NestJS services connect as a role that CANNOT hard-delete business
-- records or rewrite history, even if application code is compromised.
-- `lastchance_app` is NOLOGIN; per-environment login roles are GRANTed into
-- it with passwords managed by the secret store (never in migrations).
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lastchance_app') THEN
        CREATE ROLE lastchance_app NOLOGIN;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO lastchance_app;

-- Baseline: read/write, but NO DELETE anywhere. Removal is always a soft
-- delete (deleted_at) or a status flip — history is never destroyed.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO lastchance_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lastchance_app;

-- Narrow exceptions where hard DELETE is legitimate (pure calendar/pricing
-- config with no financial history).
GRANT DELETE ON unit_price_overrides TO lastchance_app;
GRANT DELETE ON unit_availability_blocks TO lastchance_app;

-- Append-only tables: even UPDATE is revoked (the LC403 trigger is the
-- second line of defense; privileges are the first).
REVOKE UPDATE ON audit_log, booking_status_history, ledger_entries FROM lastchance_app;

-- FSM reference data is schema, not app data.
REVOKE INSERT, UPDATE ON booking_fsm_transitions FROM lastchance_app;

-- Example per-environment login (run manually / via secret automation):
--   CREATE ROLE lastchance_api LOGIN PASSWORD :'from_vault' IN ROLE lastchance_app;
