-- ============================================================================
-- Last Chance Platform — Phase 7: Phone authentication
-- Migration 0017: allow phone as an auth provider
-- Depends on: 0004 (users)
--
-- users.auth_provider was CHECKed against ('password', 'google', 'apple'), so
-- a phone-first account could not be written at all.
--
-- TWO adjacent assumptions have to give way, and the second is the one that
-- actually bites:
--
--   1. A phone account has no password. users_password_present already permits
--      that — it only constrains auth_provider = 'password' — so nothing to do.
--
--   2. users.email was NOT NULL. A phone-first guest has no email address and
--      will not have one until they choose to add it. Synthesising a fake one
--      (guest+9665xxxxxxx@…) would be worse than nullable: it looks like a
--      real contact everywhere email is read, and something would eventually
--      try to send to it.
--
-- So email becomes nullable, and a new CHECK requires that every account has
-- at least one way to identify and reach its owner. Postgres allows multiple
-- NULLs under a UNIQUE constraint, so email uniqueness is unaffected for the
-- accounts that do have one.
-- ============================================================================
BEGIN;

ALTER TABLE users DROP CONSTRAINT users_auth_provider_check;

ALTER TABLE users ADD CONSTRAINT users_auth_provider_check
    CHECK (auth_provider IN ('password', 'google', 'apple', 'phone'));

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- An account with neither an email nor a phone number cannot be signed into,
-- contacted, or recovered. Whatever else changes, that must stay impossible.
ALTER TABLE users ADD CONSTRAINT users_identity_present CHECK (
    email IS NOT NULL OR phone IS NOT NULL
);

-- A phone-provider account without a phone number is unreachable by
-- definition. NOT VALID is unnecessary here: no such row can exist yet,
-- because 'phone' was not a legal value one statement ago.
ALTER TABLE users ADD CONSTRAINT users_phone_present CHECK (
    auth_provider <> 'phone' OR phone IS NOT NULL
);

-- The sign-in path looks accounts up by verified number; this keeps that
-- lookup off a sequential scan as the table grows.
CREATE INDEX idx_users_phone_verified ON users (phone)
    WHERE phone IS NOT NULL AND phone_verified_at IS NOT NULL;

COMMIT;
