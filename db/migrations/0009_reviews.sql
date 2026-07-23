-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0009: Reviews + denormalized rating aggregates
-- Depends on: 0006
-- ============================================================================

CREATE TABLE reviews (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- One review per booking, and only ever by the guest who stayed.
    booking_id          uuid NOT NULL UNIQUE REFERENCES bookings (id),
    property_id         uuid NOT NULL REFERENCES properties (id),
    author_id           uuid NOT NULL REFERENCES users (id),

    overall_rating      smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    cleanliness_rating  smallint CHECK (cleanliness_rating BETWEEN 1 AND 5),
    accuracy_rating     smallint CHECK (accuracy_rating BETWEEN 1 AND 5),
    location_rating     smallint CHECK (location_rating BETWEEN 1 AND 5),
    value_rating        smallint CHECK (value_rating BETWEEN 1 AND 5),

    comment             text CHECK (char_length(comment) <= 4000),
    host_reply          text CHECK (char_length(host_reply) <= 4000),
    host_replied_at     timestamptz,

    status              review_status NOT NULL DEFAULT 'PENDING',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_reviews_touch
    BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Eligibility guard: review only a COMPLETED stay, only by its guest, and
-- property_id is forced from the booking (client input cannot lie).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_review_eligibility_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_booking bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = NEW.booking_id;

    IF v_booking.status NOT IN ('COMPLETED', 'REFUNDED') THEN
        RAISE EXCEPTION 'Only completed stays can be reviewed (booking is %)', v_booking.status
            USING ERRCODE = 'LC400';
    END IF;

    IF v_booking.guest_id <> NEW.author_id THEN
        RAISE EXCEPTION 'Only the booking guest may review the stay'
            USING ERRCODE = 'LC401';
    END IF;

    NEW.property_id := v_booking.property_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reviews_eligibility
    BEFORE INSERT ON reviews
    FOR EACH ROW EXECUTE FUNCTION fn_review_eligibility_guard();

-- ---------------------------------------------------------------------------
-- Aggregate maintenance: recompute the property's and host's denormalized
-- rating columns whenever a review changes state. Full recompute (not
-- incremental) — correct under every edit/moderation path, and cheap at
-- per-property cardinality.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_review_refresh_aggregates() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_property_id uuid;
    v_host_id     uuid;
BEGIN
    -- NEW is unassigned in DELETE triggers (and OLD in INSERT) — branch on TG_OP.
    IF TG_OP = 'DELETE' THEN
        v_property_id := OLD.property_id;
    ELSE
        v_property_id := NEW.property_id;
    END IF;

    UPDATE properties p SET
        rating_avg = (
            SELECT round(avg(r.overall_rating)::numeric, 2)
            FROM reviews r
            WHERE r.property_id = v_property_id AND r.status = 'PUBLISHED'
        ),
        rating_count = (
            SELECT count(*) FROM reviews r
            WHERE r.property_id = v_property_id AND r.status = 'PUBLISHED'
        )
    WHERE p.id = v_property_id
    RETURNING p.host_id INTO v_host_id;

    UPDATE host_profiles h SET
        rating_avg = (
            SELECT round(avg(r.overall_rating)::numeric, 2)
            FROM reviews r
            JOIN properties p ON p.id = r.property_id
            WHERE p.host_id = v_host_id AND r.status = 'PUBLISHED'
        ),
        rating_count = (
            SELECT count(*)
            FROM reviews r
            JOIN properties p ON p.id = r.property_id
            WHERE p.host_id = v_host_id AND r.status = 'PUBLISHED'
        )
    WHERE h.user_id = v_host_id;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_reviews_refresh_aggregates
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION fn_review_refresh_aggregates();
