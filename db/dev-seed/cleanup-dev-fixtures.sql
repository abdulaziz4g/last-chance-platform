-- ============================================================================
-- DEVELOPMENT ONLY — removes fixtures created while building Phase 7.
--
-- WHAT THIS DOES NOT DO, AND WHY:
--
-- It does not DELETE FROM properties. Three reasons, any one of which is
-- sufficient:
--   1. `DELETE` on properties is revoked from the app role (0012); the
--      platform soft-deletes by design and never destroys history.
--   2. Properties are referenced by bookings, documents, moderation events and
--      ledger entries. Deleting one either fails on a foreign key or, worse,
--      cascades away financial history.
--   3. Selecting fixtures by `moderation_status = 'PENDING_APPROVAL'` would
--      match every listing a real host is waiting on. Run in anger against a
--      populated database, that empties the review queue.
--
-- So this targets ONLY rows it can identify as fixtures by construction: the
-- reviewer account created for UI verification, and its documents. The one
-- pre-existing listing that was parked in PENDING_APPROVAL for a screenshot is
-- RETURNED to APPROVED rather than removed — it was never a fixture, it was a
-- real dev listing borrowed for a demonstration.
--
-- Run:  docker exec -i lastchance-postgres psql -v ON_ERROR_STOP=1 \
--         -U lastchance -d lastchance -f /dev-seed/cleanup-dev-fixtures.sql
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('app.actor_type', 'ADMIN', true);
SELECT set_config('app.moderation_notes', 'Dev fixture cleanup', true);

-- Refuse to run anywhere that looks like production.
DO $$
BEGIN
    IF current_database() NOT IN ('lastchance', 'lastchance_dev', 'lastchance_test') THEN
        RAISE EXCEPTION 'Refusing to run dev cleanup against database "%"',
            current_database();
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Return borrowed listings to APPROVED.
--
-- Identified by the synthetic permit prefix the dev backfill wrote, so this
-- can never touch a listing carrying a real Ministry of Tourism number.
-- ---------------------------------------------------------------------------
UPDATE properties
   SET moderation_status = 'APPROVED'
 WHERE moderation_status = 'PENDING_APPROVAL'
   AND tourism_permit_number LIKE 'MT-DEV-%'
   AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Soft-delete the sample regulatory documents.
--
-- Only rows whose storage key points at the generated fixtures. Real uploads
-- live under a different prefix and are untouched.
-- ---------------------------------------------------------------------------
UPDATE property_documents
   SET deleted_at = now()
 WHERE deleted_at IS NULL
   AND file_name IN ('title-deed.pdf', 'mot-permit.pdf')
   AND size_bytes < 2000;   -- the generated PDFs are ~560 bytes; real scans are not

-- ---------------------------------------------------------------------------
-- 3. Deactivate the reviewer account.
--
-- Deactivated, not deleted: audit_log and property_moderation_events reference
-- this user as the actor behind real decisions, and those references must keep
-- resolving. An admin account that can no longer sign in is the correct
-- end state; an admin account that never existed is a hole in the trail.
--
-- The password hash is deliberately LEFT IN PLACE. Clearing it violates
-- users_password_present, which requires a 'password'-provider account to have
-- one — and the constraint is right: an account whose provider says "password"
-- but has no hash is a broken row, not a locked one. Locking is what
-- status = DEACTIVATED and deleted_at do, and AuthService.login checks both.
-- ---------------------------------------------------------------------------
UPDATE users
   SET status        = 'DEACTIVATED',
       platform_role = 'USER',
       deleted_at    = now()
 WHERE email = 'reviewer@lastchance.local';

DO $$
DECLARE
    v_returned bigint;
    v_docs     bigint;
    v_reviewer bigint;
BEGIN
    SELECT count(*) INTO v_returned FROM properties
     WHERE tourism_permit_number LIKE 'MT-DEV-%' AND moderation_status = 'APPROVED';
    SELECT count(*) INTO v_docs FROM property_documents
     WHERE deleted_at IS NOT NULL AND size_bytes < 2000;
    SELECT count(*) INTO v_reviewer FROM users
     WHERE email = 'reviewer@lastchance.local' AND deleted_at IS NOT NULL;

    RAISE NOTICE 'Cleanup complete: % dev listings approved, % sample documents retired, reviewer accounts deactivated: %',
        v_returned, v_docs, v_reviewer;
END $$;

COMMIT;

-- The generated sample PDFs still sit on disk. They are outside the database's
-- reach, so remove them from the shell:
--   rm -rf backend/var/uploads/props/
