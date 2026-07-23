-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0011: Query-path indexes
-- Depends on: all previous migrations
--
-- Constraint-backing indexes (UNIQUE, EXCLUDE/GIST) already exist with their
-- tables; these serve the hot read paths. Partial indexes keep the working
-- set small — most bookings are historical, most deals are dead.
-- ============================================================================

-- ---- bookings --------------------------------------------------------------
-- Guest "my trips" screens.
CREATE INDEX idx_bookings_guest_recent ON bookings (guest_id, created_at DESC);
-- Host/admin dashboards per property.
CREATE INDEX idx_bookings_property_status ON bookings (property_id, status);
-- Unit calendar timeline scans.
CREATE INDEX idx_bookings_unit_start ON bookings (unit_id, lower(block_range));
-- The safety-net hold sweeper: tiny index, only live holds.
CREATE INDEX idx_bookings_hold_sweeper ON bookings (hold_expires_at)
    WHERE status = 'PENDING_PAYMENT';
-- Deal-attribution analytics.
CREATE INDEX idx_bookings_flash_deal ON bookings (flash_deal_id)
    WHERE flash_deal_id IS NOT NULL;

-- ---- booking_status_history ------------------------------------------------
CREATE INDEX idx_history_booking ON booking_status_history (booking_id, created_at);

-- ---- payments / refunds / webhooks / payouts -------------------------------
CREATE INDEX idx_payments_booking ON payments (booking_id);
CREATE INDEX idx_payments_open ON payments (status, created_at)
    WHERE status IN ('INITIATED', 'REQUIRES_ACTION', 'AUTHORIZED');
CREATE INDEX idx_refunds_payment ON refunds (payment_id);
-- The webhook worker queue scan.
CREATE INDEX idx_webhooks_pending ON payment_webhook_events (received_at)
    WHERE processing_status IN ('RECEIVED', 'FAILED');
CREATE INDEX idx_payouts_host_status ON payouts (host_id, status);
CREATE INDEX idx_payouts_due ON payouts (scheduled_for)
    WHERE status IN ('PENDING', 'SCHEDULED');

-- ---- ledger ----------------------------------------------------------------
CREATE INDEX idx_ledger_group ON ledger_entries (entry_group_id);
CREATE INDEX idx_ledger_booking ON ledger_entries (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_ledger_host ON ledger_entries (host_id) WHERE host_id IS NOT NULL;
CREATE INDEX brin_ledger_created ON ledger_entries USING brin (created_at);

-- ---- inventory -------------------------------------------------------------
-- (idx_properties_geo GIST index created in 0005 with the table.)
CREATE INDEX idx_properties_host ON properties (host_id);
CREATE INDEX idx_properties_market ON properties (country_code, city)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;
CREATE INDEX idx_properties_name_trgm ON properties USING gin (name gin_trgm_ops);
CREATE INDEX idx_units_property ON units (property_id)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;
CREATE INDEX idx_blocks_unit ON unit_availability_blocks (unit_id) WHERE is_active;
CREATE INDEX idx_price_overrides_unit ON unit_price_overrides (unit_id);

-- ---- flash deals -----------------------------------------------------------
-- The "deals going live / expiring" scheduler scan and live-deal feeds.
CREATE INDEX idx_flash_deals_lifecycle ON flash_deals (status, starts_at);
CREATE INDEX idx_flash_deals_unit ON flash_deals (unit_id);

-- ---- reviews ---------------------------------------------------------------
CREATE INDEX idx_reviews_property_published ON reviews (property_id, created_at DESC)
    WHERE status = 'PUBLISHED';
