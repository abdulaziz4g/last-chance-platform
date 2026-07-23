-- ============================================================================
-- Last Chance Platform — Phase 3
-- Migration 0013: MOCK payment provider enum value
--
-- The MOCK provider is the deterministic in-house PSP used by development and
-- the integration test suite (signed webhooks, instant captures). Production
-- configuration never enables it; having it in the enum keeps test traffic
-- flowing through the exact same tables, constraints, and ledger as real
-- providers — which is the point.
-- ============================================================================

ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'MOCK';
