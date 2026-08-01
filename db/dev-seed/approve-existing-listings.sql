-- ============================================================================
-- DEVELOPMENT ONLY — do not run against production.
--
-- Migration 0016 introduced the regulatory gate: a listing is only public once
-- an admin has approved it. Every property that existed before 0016 defaulted
-- to DRAFT, which is correct — nobody reviewed them — but it means an existing
-- dev database goes dark: no map pins, no search results, no bookable units.
--
-- This backfills plausible compliance data and walks each pre-existing listing
-- through the real FSM path so a dev environment behaves normally again.
--
-- WHY THIS IS NOT A MIGRATION: approving a listing asserts that someone checked
-- a title deed and a Ministry of Tourism permit. Doing that automatically for
-- rows nobody has looked at is precisely the thing the gate exists to prevent.
-- In production those listings SHOULD sit in the review queue until an admin
-- works through them.
--
-- Run:  docker exec -i lastchance-postgres psql -v ON_ERROR_STOP=1 \
--         -U lastchance -d lastchance -f /dev-seed/approve-existing-listings.sql
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('app.actor_type', 'SYSTEM', true);
SELECT set_config('app.moderation_notes', 'Dev backfill: pre-0016 listing', true);

-- Refuse to run anywhere that looks like production.
DO $$
BEGIN
    IF current_database() NOT IN ('lastchance', 'lastchance_dev', 'lastchance_test') THEN
        RAISE EXCEPTION 'Refusing to run the dev backfill against database "%"',
            current_database();
    END IF;
END $$;

-- Synthetic but well-formed compliance data. The short address is derived from
-- the property id so repeated runs are stable and no two listings collide.
UPDATE properties p SET
    national_short_address = 'DEV'
        || chr((65 + (abs(hashtextextended(p.id::text, 1)) % 26))::int)
        || lpad(((abs(hashtextextended(p.id::text, 2)) % 9000) + 1000)::text, 4, '0'),
    building_number   = lpad(((abs(hashtextextended(p.id::text, 3)) % 9000) + 1000)::text, 4, '0'),
    additional_number = lpad(((abs(hashtextextended(p.id::text, 4)) % 9000) + 1000)::text, 4, '0'),
    district          = COALESCE(p.district, 'Dev District'),
    tourism_permit_number     = 'MT-DEV-' || substr(p.id::text, 1, 8),
    tourism_permit_expires_at = current_date + 365,
    status                    = 'ACTIVE'
WHERE p.moderation_status = 'DRAFT'
  AND p.deleted_at IS NULL;

-- Two hops: the FSM has no DRAFT -> APPROVED edge, by design.
UPDATE properties SET moderation_status = 'PENDING_APPROVAL'
 WHERE moderation_status = 'DRAFT' AND deleted_at IS NULL;

UPDATE properties SET moderation_status = 'APPROVED'
 WHERE moderation_status = 'PENDING_APPROVAL' AND deleted_at IS NULL;

DO $$
DECLARE
    v_approved bigint;
    v_public   bigint;
BEGIN
    SELECT count(*) INTO v_approved FROM properties
     WHERE moderation_status = 'APPROVED' AND deleted_at IS NULL;
    SELECT count(*) INTO v_public FROM v_public_units;
    RAISE NOTICE 'Dev backfill complete: % approved properties, % public units',
        v_approved, v_public;
END $$;

COMMIT;

-- Reminder: the OpenSearch index filters on moderation_status too, so reindex
-- afterwards or these listings stay missing from text search:
--   curl -XPOST http://localhost:3000/search/reindex
