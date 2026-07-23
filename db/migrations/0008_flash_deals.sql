-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0008: Flash deals (the real-time USP)
-- Depends on: 0005, 0006
-- ============================================================================

CREATE TABLE flash_deals (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id               uuid NOT NULL REFERENCES units (id),
    created_by            uuid NOT NULL REFERENCES users (id),
    title                 text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),

    discount_pct          percentage NOT NULL CHECK (discount_pct BETWEEN 5 AND 90),
    status                flash_deal_status NOT NULL DEFAULT 'SCHEDULED',

    -- The claim window (countdown the apps render in real time).
    starts_at             timestamptz NOT NULL,
    ends_at               timestamptz NOT NULL,
    active_range          tstzrange GENERATED ALWAYS AS (
                              tstzrange(starts_at, ends_at, '[)')
                          ) STORED,
    -- Optional restriction: the deal applies only to stays inside this window
    -- (e.g. "tonight only"). NULL = any stay booked during the claim window.
    applicable_stay_range tstzrange,

    -- Scarcity inventory. Claiming is atomic in the service layer:
    --   UPDATE flash_deals SET quantity_claimed = quantity_claimed + 1
    --   WHERE id = $1 AND status = 'ACTIVE' AND quantity_claimed < quantity_total
    --   RETURNING quantity_claimed;
    -- (0 rows = sold out — no lock, no race; CHECK below is the backstop.)
    quantity_total        integer NOT NULL CHECK (quantity_total > 0),
    quantity_claimed      integer NOT NULL DEFAULT 0,

    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT deals_valid_window CHECK (ends_at > starts_at),
    -- Flash means flash: claim windows are capped at 72h.
    CONSTRAINT deals_max_duration CHECK (ends_at - starts_at <= interval '72 hours'),
    CONSTRAINT deals_claims_within_inventory CHECK (
        quantity_claimed >= 0 AND quantity_claimed <= quantity_total
    ),
    -- One live/scheduled deal per unit at a time — no stacking ambiguity.
    CONSTRAINT deals_no_overlap_per_unit EXCLUDE USING gist (
        unit_id      WITH =,
        active_range WITH &&
    ) WHERE (status IN ('SCHEDULED', 'ACTIVE'))
);

CREATE TRIGGER trg_flash_deals_touch
    BEFORE UPDATE ON flash_deals
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Auto-flip to SOLD_OUT when the last unit is claimed (belt to the service's
-- suspenders; also publishes correct state to anything reading the row).
CREATE OR REPLACE FUNCTION fn_flash_deal_sold_out() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.quantity_claimed = NEW.quantity_total AND NEW.status = 'ACTIVE' THEN
        NEW.status := 'SOLD_OUT';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flash_deals_sold_out
    BEFORE UPDATE OF quantity_claimed ON flash_deals
    FOR EACH ROW EXECUTE FUNCTION fn_flash_deal_sold_out();

-- Deferred FK from 0006: bookings reference the deal they claimed.
ALTER TABLE bookings
    ADD CONSTRAINT bookings_flash_deal_fk
    FOREIGN KEY (flash_deal_id) REFERENCES flash_deals (id);
