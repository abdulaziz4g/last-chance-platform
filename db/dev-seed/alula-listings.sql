-- ============================================================================
-- DEVELOPMENT ONLY — inventory in AlUla, the launch market.
--
-- The dev database grew up around Riyadh, so the map's default viewport
-- (AlUla) is empty and every map change looks broken until you pan 850 km
-- east. This seeds a handful of approved listings on the real escarpment
-- coordinates, including one carrying a live flash deal so the gold pin
-- treatment is exercisable.
--
-- Idempotent: re-running updates the same rows rather than duplicating them.
--
-- Run:  docker exec -i lastchance-postgres psql -v ON_ERROR_STOP=1 \
--         -U lastchance -d lastchance -f /dev-seed/alula-listings.sql
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('app.actor_type', 'ADMIN', true);

DO $$
BEGIN
    IF current_database() NOT IN ('lastchance', 'lastchance_dev', 'lastchance_test') THEN
        RAISE EXCEPTION 'Refusing to seed database "%"', current_database();
    END IF;
END $$;

-- Host ------------------------------------------------------------------
INSERT INTO users (id, email, full_name, auth_provider, phone, phone_verified_at)
VALUES ('00000000-0000-0000-0000-0000000a1a01', 'alula-host@dev.local',
        'AlUla Heritage Hosts', 'google', '+966500111222', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO host_profiles (user_id, display_name, kyc_status,
                           national_id_type, national_id_hash, national_id_last4)
VALUES ('00000000-0000-0000-0000-0000000a1a01', 'AlUla Heritage Hosts', 'VERIFIED',
        'NATIONAL_ID', 'dev-hash-alula-host', '1042')
ON CONFLICT (user_id) DO NOTHING;

-- Properties -------------------------------------------------------------
-- Real coordinates: Old Town (37.9231, 26.6089), Hegra approach
-- (37.9553, 26.7869), Elephant Rock (38.0261, 26.6534).
INSERT INTO properties (id, host_id, name, slug, property_type, status,
                        city, district, country_code, location,
                        national_short_address, building_number, additional_number,
                        tourism_permit_number, tourism_permit_expires_at,
                        amenities, timezone)
VALUES
  ('00000000-0000-0000-0000-0000000a1ab1', '00000000-0000-0000-0000-0000000a1a01',
   'Dar Tantora Heritage House', 'dar-tantora-heritage-house', 'REST_HOUSE', 'ACTIVE',
   'AlUla', 'Old Town', 'SA',
   ST_SetSRID(ST_MakePoint(37.9231, 26.6089), 4326)::geography,
   'ALUL2342', '8231', '4417', 'MT-DEV-ALULA01', current_date + 365,
   '["wifi","breakfast","heritage"]'::jsonb, 'Asia/Riyadh'),
  ('00000000-0000-0000-0000-0000000a1ab2', '00000000-0000-0000-0000-0000000a1a01',
   'Hegra Desert Camp', 'hegra-desert-camp', 'CAMP', 'ACTIVE',
   'AlUla', 'Hegra', 'SA',
   ST_SetSRID(ST_MakePoint(37.9553, 26.7869), 4326)::geography,
   'ALUL7781', '1120', '3390', 'MT-DEV-ALULA02', current_date + 365,
   '["stargazing","firepit"]'::jsonb, 'Asia/Riyadh'),
  ('00000000-0000-0000-0000-0000000a1ab3', '00000000-0000-0000-0000-0000000a1a01',
   'Elephant Rock Glamping', 'elephant-rock-glamping', 'CHALET', 'ACTIVE',
   'AlUla', 'Jabal AlFil', 'SA',
   ST_SetSRID(ST_MakePoint(38.0261, 26.6534), 4326)::geography,
   'ALUL5520', '4402', '8810', 'MT-DEV-ALULA03', current_date + 365,
   '["pool","desert-view"]'::jsonb, 'Asia/Riyadh')
ON CONFLICT (id) DO NOTHING;

-- Units ------------------------------------------------------------------
INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                   max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                   min_hourly_duration_minutes, turnaround_minutes, status)
VALUES
  ('00000000-0000-0000-0000-0000000a1ac1', '00000000-0000-0000-0000-0000000a1ab1',
   'Nabataean Suite', 'SUITE', true, true, 4, 'SAR', 145000, 32000, 120, 60, 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000a1ac2', '00000000-0000-0000-0000-0000000a1ab1',
   'Courtyard Room', 'ROOM', true, true, 2, 'SAR', 92000, 21000, 120, 45, 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000a1ac3', '00000000-0000-0000-0000-0000000a1ab2',
   'Stargazer Tent', 'STUDIO', false, true, 3, 'SAR', 118000, NULL, 60, 60, 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000a1ac4', '00000000-0000-0000-0000-0000000a1ab3',
   'Escarpment Villa', 'ENTIRE_VILLA', true, true, 6, 'SAR', 260000, 55000, 180, 90, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Approve through the real FSM path (no DRAFT -> APPROVED shortcut exists).
UPDATE properties SET moderation_status = 'PENDING_APPROVAL'
 WHERE id IN ('00000000-0000-0000-0000-0000000a1ab1',
              '00000000-0000-0000-0000-0000000a1ab2',
              '00000000-0000-0000-0000-0000000a1ab3')
   AND moderation_status = 'DRAFT';

UPDATE properties SET moderation_status = 'APPROVED'
 WHERE id IN ('00000000-0000-0000-0000-0000000a1ab1',
              '00000000-0000-0000-0000-0000000a1ab2',
              '00000000-0000-0000-0000-0000000a1ab3')
   AND moderation_status = 'PENDING_APPROVAL';

-- One live flash deal, so the gold pin and its pulse have something to show.
INSERT INTO flash_deals (id, unit_id, created_by, title, discount_pct, status,
                         starts_at, ends_at, quantity_total)
VALUES ('00000000-0000-0000-0000-0000000a1ad1',
        '00000000-0000-0000-0000-0000000a1ac3',
        '00000000-0000-0000-0000-0000000a1a01',
        'Tonight under the Hegra sky — 25% off', 25, 'ACTIVE',
        now() - interval '5 minutes', now() + interval '20 hours', 4)
ON CONFLICT (id) DO UPDATE
   SET status   = 'ACTIVE',
       ends_at  = now() + interval '20 hours',
       quantity_claimed = 0;

DO $$
DECLARE
    v_public bigint;
BEGIN
    SELECT count(*) INTO v_public FROM v_public_units WHERE city = 'AlUla';
    RAISE NOTICE 'AlUla seed complete: % public units', v_public;
END $$;

COMMIT;
