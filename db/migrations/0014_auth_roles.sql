-- ============================================================================
-- Last Chance Platform — Phase 6
-- Migration 0014: platform roles for JWT authorization
--
-- Role model: platform_role is the back-office axis (USER vs ADMIN staff).
-- "Host" is NOT a role — it remains derived from owning a host_profiles row
-- (DDD: capability, not identity). The JWT carries both facts.
-- ============================================================================

ALTER TABLE users
    ADD COLUMN platform_role text NOT NULL DEFAULT 'USER'
    CHECK (platform_role IN ('USER', 'ADMIN'));

CREATE INDEX idx_users_admins ON users (id) WHERE platform_role = 'ADMIN';
