-- ============================================================================
-- Last Chance Platform — the migration ledger
--
-- Applied by the runners BEFORE any migration, and deliberately NOT itself a
-- numbered migration: the thing that records what has run cannot be one of the
-- things whose run is being recorded.
--
-- Idempotent, so both runners can apply it unconditionally on every invocation.
--
-- WHY THIS EXISTS: without it, `run-migrations` replayed every file every time.
-- Since `CREATE TYPE user_status …` has no IF NOT EXISTS, a second run failed
-- at 0002 — so the script only ever worked against a virgin database, and
-- anyone cloning the repo with an existing database hit it immediately.
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text PRIMARY KEY,

    -- SHA-256 of the file with CR bytes stripped. Line endings are normalised
    -- because this repo checks out LF on Linux and CRLF on Windows, so the
    -- same migration would otherwise hash differently per platform and every
    -- Windows developer would be told the history had been tampered with.
    checksum    text NOT NULL,

    applied_at  timestamptz NOT NULL DEFAULT now(),
    applied_by  text NOT NULL DEFAULT current_user,

    -- TRUE means the row was adopted by --baseline: the migration's effects
    -- were already present and it was never executed against this database.
    -- An explicit flag rather than "duration_ms IS NULL", which conflated
    -- "not executed" with "executed but not timed".
    baselined   boolean NOT NULL DEFAULT false,

    -- Wall time of the run, filled in after it succeeds. NULL on baselined
    -- rows, and on rows written before timing was recorded.
    duration_ms integer
);

-- Adopt the flag on a ledger created before it existed.
ALTER TABLE schema_migrations
    ADD COLUMN IF NOT EXISTS baselined boolean NOT NULL DEFAULT false;

COMMENT ON TABLE schema_migrations IS
    'One row per applied migration, written by db/run-migrations.{sh,ps1}. '
    'baselined = true means the file was recorded without being executed.';
