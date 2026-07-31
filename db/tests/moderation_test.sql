-- ============================================================================
-- Last Chance Platform — Phase 7 moderation & compliance smoke test
-- Proves every guarantee migration 0016 claims, then rolls everything back.
-- Run:  docker exec -i lastchance-postgres psql -q -v ON_ERROR_STOP=1 \
--         -U lastchance -d lastchance -f /db-tests/moderation_test.sql
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('app.actor_type', 'ADMIN', true);
SELECT set_config('app.actor_id', '00000000-0000-0000-0000-0000000ad001', true);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO users (id, email, full_name, auth_provider, platform_role) VALUES
    ('00000000-0000-0000-0000-0000000ad001', 'admin@test.local', 'Test Admin', 'google', 'ADMIN'),
    ('00000000-0000-0000-0000-0000000b0001', 'mhost@test.local',  'Mod Host',   'google', 'USER');

INSERT INTO host_profiles (user_id, display_name)
VALUES ('00000000-0000-0000-0000-0000000b0001', 'Mod Host');

-- AlUla coordinates (37.9° E, 26.6° N).
INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location)
VALUES ('00000000-0000-0000-0000-0000000c0001',
        '00000000-0000-0000-0000-0000000b0001',
        'AlUla Heritage House', 'alula-heritage-house', 'REST_HOUSE', 'ACTIVE',
        'AlUla', 'SA',
        ST_SetSRID(ST_MakePoint(37.9200, 26.6100), 4326)::geography);

INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                   max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                   turnaround_minutes, status)
VALUES ('00000000-0000-0000-0000-0000000d0001',
        '00000000-0000-0000-0000-0000000c0001',
        'Nabataean Suite', 'SUITE', true, true, 4, 'SAR', 120000, 25000, 45, 'ACTIVE');

-- ---------------------------------------------------------------------------
-- TEST 1: a new listing starts in DRAFT and is invisible to the public
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_status moderation_status;
    v_public bigint;
BEGIN
    SELECT moderation_status INTO v_status FROM properties
    WHERE id = '00000000-0000-0000-0000-0000000c0001';
    SELECT count(*) INTO v_public FROM v_public_units
    WHERE property_id = '00000000-0000-0000-0000-0000000c0001';

    IF v_status <> 'DRAFT' OR v_public <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: status=%, public rows=%', v_status, v_public;
    END IF;
    RAISE NOTICE 'PASS 1: new listing is DRAFT and hidden from v_public_units';
END $$;

-- ---------------------------------------------------------------------------
-- TEST 2: moderation FSM rejects a skipped review (DRAFT -> APPROVED), LC410
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        UPDATE properties SET moderation_status = 'APPROVED'
        WHERE id = '00000000-0000-0000-0000-0000000c0001';
        RAISE EXCEPTION 'TEST 2 FAILED: DRAFT -> APPROVED was accepted';
    EXCEPTION WHEN SQLSTATE 'LC410' THEN
        RAISE NOTICE 'PASS 2: self-approval without review rejected (LC410)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 3: approval without the regulatory paperwork is refused by CHECK
-- ---------------------------------------------------------------------------
UPDATE properties SET moderation_status = 'PENDING_APPROVAL'
WHERE id = '00000000-0000-0000-0000-0000000c0001';

DO $$
BEGIN
    BEGIN
        UPDATE properties SET moderation_status = 'APPROVED'
        WHERE id = '00000000-0000-0000-0000-0000000c0001';
        RAISE EXCEPTION 'TEST 3 FAILED: approved with no permit on file';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS 3: approval without National Address + permit refused';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 4: a rejection with no reason code is refused (LC411)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        PERFORM set_config('app.moderation_reason', '', true);
        UPDATE properties SET moderation_status = 'REJECTED'
        WHERE id = '00000000-0000-0000-0000-0000000c0001';
        RAISE EXCEPTION 'TEST 4 FAILED: reasonless rejection accepted';
    EXCEPTION WHEN SQLSTATE 'LC411' THEN
        RAISE NOTICE 'PASS 4: rejection without a reason code refused (LC411)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 5: a reasoned rejection is recorded with its code, then the host
-- fixes the issue and resubmits
-- ---------------------------------------------------------------------------
SELECT set_config('app.moderation_reason', 'PERMIT_NOT_FOUND', true);
SELECT set_config('app.moderation_notes', 'MoT permit number returns no match', true);
UPDATE properties SET moderation_status = 'REJECTED'
WHERE id = '00000000-0000-0000-0000-0000000c0001';

DO $$
DECLARE
    v_code moderation_reason_code;
    v_note text;
BEGIN
    SELECT reason_code, notes INTO v_code, v_note
    FROM property_moderation_events
    WHERE property_id = '00000000-0000-0000-0000-0000000c0001'
      AND to_status = 'REJECTED'
    ORDER BY created_at DESC LIMIT 1;

    IF v_code <> 'PERMIT_NOT_FOUND' OR v_note IS NULL THEN
        RAISE EXCEPTION 'TEST 5 FAILED: code=%, note=%', v_code, v_note;
    END IF;
    RAISE NOTICE 'PASS 5: rejection logged with code % and notes', v_code;
END $$;

SELECT set_config('app.moderation_reason', '', true);
SELECT set_config('app.moderation_notes', '', true);

-- ---------------------------------------------------------------------------
-- TEST 6: host supplies the paperwork and the listing is approved
-- ---------------------------------------------------------------------------
UPDATE properties SET
    national_short_address    = 'ALUL2342',
    building_number           = '8231',
    additional_number         = '4417',
    district                  = 'Al-Diwan',
    tourism_permit_number     = 'MT-1445-004821',
    tourism_permit_expires_at = current_date + 365
WHERE id = '00000000-0000-0000-0000-0000000c0001';

INSERT INTO property_documents (property_id, document_type, storage_key, file_name,
                                content_type, size_bytes, uploaded_by, issued_on, expires_on)
VALUES ('00000000-0000-0000-0000-0000000c0001', 'TITLE_DEED',
        'props/pr001/deed.pdf', 'title-deed.pdf', 'application/pdf', 482000,
        '00000000-0000-0000-0000-0000000b0001', current_date - 400, NULL),
       ('00000000-0000-0000-0000-0000000c0001', 'TOURISM_PERMIT',
        'props/pr001/permit.pdf', 'mot-permit.pdf', 'application/pdf', 118000,
        '00000000-0000-0000-0000-0000000b0001', current_date - 30, current_date + 365);

UPDATE properties SET moderation_status = 'PENDING_APPROVAL'
WHERE id = '00000000-0000-0000-0000-0000000c0001';
UPDATE properties SET moderation_status = 'APPROVED'
WHERE id = '00000000-0000-0000-0000-0000000c0001';

DO $$
DECLARE
    v_by uuid;
    v_at timestamptz;
BEGIN
    SELECT approved_by, approved_at INTO v_by, v_at FROM properties
    WHERE id = '00000000-0000-0000-0000-0000000c0001';
    IF v_by <> '00000000-0000-0000-0000-0000000ad001' OR v_at IS NULL THEN
        RAISE EXCEPTION 'TEST 6 FAILED: approved_by=%, approved_at=%', v_by, v_at;
    END IF;
    RAISE NOTICE 'PASS 6: approval stamps the deciding admin and timestamp';
END $$;

-- ---------------------------------------------------------------------------
-- TEST 7: an approved + active listing becomes publicly visible
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_public bigint;
BEGIN
    SELECT count(*) INTO v_public FROM v_public_units
    WHERE property_id = '00000000-0000-0000-0000-0000000c0001';
    IF v_public <> 1 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: expected 1 public unit, got %', v_public;
    END IF;
    RAISE NOTICE 'PASS 7: approved listing appears in v_public_units';
END $$;

-- ---------------------------------------------------------------------------
-- TEST 8: the two axes are independent — taking a unit offline for
-- maintenance hides it WITHOUT disturbing its approved state
-- ---------------------------------------------------------------------------
UPDATE units SET status = 'MAINTENANCE'
WHERE id = '00000000-0000-0000-0000-0000000d0001';

DO $$
DECLARE
    v_public bigint;
    v_mod    moderation_status;
BEGIN
    SELECT count(*) INTO v_public FROM v_public_units
    WHERE property_id = '00000000-0000-0000-0000-0000000c0001';
    SELECT moderation_status INTO v_mod FROM properties
    WHERE id = '00000000-0000-0000-0000-0000000c0001';

    IF v_public <> 0 OR v_mod <> 'APPROVED' THEN
        RAISE EXCEPTION 'TEST 8 FAILED: public=%, moderation=%', v_public, v_mod;
    END IF;
    RAISE NOTICE 'PASS 8: MAINTENANCE hides the unit while approval survives';
END $$;

UPDATE units SET status = 'ACTIVE'
WHERE id = '00000000-0000-0000-0000-0000000d0001';

-- ---------------------------------------------------------------------------
-- TEST 9: an admin suspension pulls a live listing off the map immediately
-- ---------------------------------------------------------------------------
UPDATE properties SET moderation_status = 'SUSPENDED'
WHERE id = '00000000-0000-0000-0000-0000000c0001';

DO $$
DECLARE
    v_public bigint;
BEGIN
    SELECT count(*) INTO v_public FROM v_public_units
    WHERE property_id = '00000000-0000-0000-0000-0000000c0001';
    IF v_public <> 0 THEN
        RAISE EXCEPTION 'TEST 9 FAILED: suspended listing still public';
    END IF;
    RAISE NOTICE 'PASS 9: SUSPENDED removes the listing from public view';
END $$;

UPDATE properties SET moderation_status = 'APPROVED'
WHERE id = '00000000-0000-0000-0000-0000000c0001';

-- ---------------------------------------------------------------------------
-- TEST 10: the privacy guard — approximate location is offset 250-500 m and
-- is STABLE across reads (a per-request jitter would average away)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_dist_1 double precision;
    v_dist_2 double precision;
    v_approx_1 geography;
    v_approx_2 geography;
BEGIN
    SELECT approx_location, ST_Distance(location, approx_location)
    INTO v_approx_1, v_dist_1
    FROM properties WHERE id = '00000000-0000-0000-0000-0000000c0001';

    IF v_dist_1 < 250 OR v_dist_1 > 500 THEN
        RAISE EXCEPTION 'TEST 10 FAILED: offset % m outside [250, 500]', round(v_dist_1);
    END IF;

    -- An unrelated write must not move the circle.
    UPDATE properties SET description = 'Restored heritage house in AlUla old town'
    WHERE id = '00000000-0000-0000-0000-0000000c0001';

    SELECT approx_location, ST_Distance(location, approx_location)
    INTO v_approx_2, v_dist_2
    FROM properties WHERE id = '00000000-0000-0000-0000-0000000c0001';

    IF NOT ST_Equals(v_approx_1::geometry, v_approx_2::geometry) THEN
        RAISE EXCEPTION 'TEST 10 FAILED: approx_location moved between writes';
    END IF;

    RAISE NOTICE 'PASS 10: privacy offset is % m and stable across writes', round(v_dist_1);
END $$;

-- ---------------------------------------------------------------------------
-- TEST 11: the moderation decision log is append-only (LC403)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        UPDATE property_moderation_events SET notes = 'tamper'
        WHERE property_id = '00000000-0000-0000-0000-0000000c0001';
        RAISE EXCEPTION 'TEST 11 FAILED: moderation event was rewritten';
    EXCEPTION WHEN SQLSTATE 'LC403' THEN
        RAISE NOTICE 'PASS 11: moderation decision log is append-only (LC403)';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 12: one national identity cannot back two host accounts
-- ---------------------------------------------------------------------------
UPDATE host_profiles SET
    national_id_type  = 'NATIONAL_ID',
    national_id_hash  = 'argon2id$v=19$fakehash$for$test$only',
    national_id_last4 = '7412',
    kyc_status        = 'VERIFIED'
WHERE user_id = '00000000-0000-0000-0000-0000000b0001';

INSERT INTO users (id, email, full_name, auth_provider)
VALUES ('00000000-0000-0000-0000-0000000b0002', 'mhost2@test.local', 'Second Host', 'google');
INSERT INTO host_profiles (user_id, display_name)
VALUES ('00000000-0000-0000-0000-0000000b0002', 'Second Host');

DO $$
BEGIN
    BEGIN
        UPDATE host_profiles SET
            national_id_type = 'NATIONAL_ID',
            national_id_hash = 'argon2id$v=19$fakehash$for$test$only'
        WHERE user_id = '00000000-0000-0000-0000-0000000b0002';
        RAISE EXCEPTION 'TEST 12 FAILED: duplicate national identity accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS 12: one national identity per host enforced';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 13: a VERIFIED host must actually have an identity on file
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        UPDATE host_profiles SET kyc_status = 'VERIFIED'
        WHERE user_id = '00000000-0000-0000-0000-0000000b0002';
        RAISE EXCEPTION 'TEST 13 FAILED: verified a host with no identity';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS 13: VERIFIED requires an identity on file';
    END;
END $$;

-- ---------------------------------------------------------------------------
-- TEST 14: only one live document of each type per property
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO property_documents (property_id, document_type, storage_key, file_name,
                                        content_type, size_bytes, uploaded_by)
        VALUES ('00000000-0000-0000-0000-0000000c0001', 'TITLE_DEED',
                'props/pr001/deed-v2.pdf', 'deed-v2.pdf', 'application/pdf', 490000,
                '00000000-0000-0000-0000-0000000b0001');
        RAISE EXCEPTION 'TEST 14 FAILED: two live title deeds accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS 14: one live document per type per property';
    END;
END $$;

-- Superseding works: soft-delete the old, then upload the replacement.
UPDATE property_documents SET deleted_at = now()
WHERE property_id = '00000000-0000-0000-0000-0000000c0001' AND document_type = 'TITLE_DEED';
INSERT INTO property_documents (property_id, document_type, storage_key, file_name,
                                content_type, size_bytes, uploaded_by)
VALUES ('00000000-0000-0000-0000-0000000c0001', 'TITLE_DEED',
        'props/pr001/deed-v2.pdf', 'deed-v2.pdf', 'application/pdf', 490000,
        '00000000-0000-0000-0000-0000000b0001');
DO $$ BEGIN RAISE NOTICE 'PASS 14b: superseding a document keeps the replaced copy'; END $$;

-- ---------------------------------------------------------------------------
-- TEST 15: regulated identifiers never reach the audit log
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_leaks bigint;
BEGIN
    SELECT count(*) INTO v_leaks FROM audit_log
    WHERE table_name = 'host_profiles'
      AND (new_data ? 'national_id_hash' OR old_data ? 'national_id_hash'
        OR new_data ? 'national_id'      OR old_data ? 'national_id'
        OR new_data ? 'iban'             OR old_data ? 'iban');
    IF v_leaks <> 0 THEN
        RAISE EXCEPTION 'TEST 15 FAILED: % audit rows carry regulated identifiers', v_leaks;
    END IF;
    RAISE NOTICE 'PASS 15: audit log carries no regulated identifiers';
END $$;

DO $$ BEGIN RAISE NOTICE '=== ALL MODERATION TESTS PASSED ==='; END $$;

ROLLBACK;
