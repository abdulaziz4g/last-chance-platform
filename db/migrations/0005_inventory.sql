-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0005: Inventory (properties, units, availability blocks, pricing)
-- Depends on: 0004
-- ============================================================================

-- ---------------------------------------------------------------------------
-- properties — a physical venue owned by a host. Coordinates are stored as
-- PostGIS geography (meters-accurate distance math); timezone is IANA text
-- used ONLY for presentation — all booking instants are UTC.
-- ---------------------------------------------------------------------------
CREATE TABLE properties (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id                uuid NOT NULL REFERENCES host_profiles (user_id),
    name                   text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    slug                   text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description            text,
    property_type          property_type NOT NULL,
    status                 property_status NOT NULL DEFAULT 'DRAFT',

    address_line1          text,
    address_line2          text,
    city                   text NOT NULL,
    state_region           text,
    postal_code            text,
    country_code           char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    -- geography(Point, 4326): ST_DWithin/ST_Distance return meters directly.
    location               geography(Point, 4326) NOT NULL,
    timezone               text NOT NULL DEFAULT 'Asia/Riyadh',

    amenities              jsonb NOT NULL DEFAULT '[]'::jsonb,
    policies               jsonb NOT NULL DEFAULT '{}'::jsonb,
    default_check_in_time  time NOT NULL DEFAULT '15:00',
    default_check_out_time time NOT NULL DEFAULT '12:00',

    -- Denormalized review aggregates, maintained by trigger in 0009.
    rating_avg             numeric(3, 2) CHECK (rating_avg BETWEEN 1 AND 5),
    rating_count           integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),

    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    deleted_at             timestamptz
);

CREATE INDEX idx_properties_geo ON properties USING gist (location);

CREATE TRIGGER trg_properties_touch
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- units — the atomic bookable resource. Deliberately quantity = 1:
-- a hotel "room type" with 20 identical rooms is modeled as 20 unit rows
-- sharing unit_group_key. This is what lets the GIST exclusion constraint
-- give an engine-level double-booking guarantee; capacity-counter models
-- cannot make that promise.
-- ---------------------------------------------------------------------------
CREATE TABLE units (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id                uuid NOT NULL REFERENCES properties (id),
    name                       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    unit_type                  unit_type NOT NULL,
    -- Groups identical units into a sellable "room type" (nullable).
    unit_group_key             text,

    supports_hourly            boolean NOT NULL DEFAULT false,
    supports_nightly           boolean NOT NULL DEFAULT true,

    max_guests                 smallint NOT NULL CHECK (max_guests BETWEEN 1 AND 50),
    bedrooms                   smallint CHECK (bedrooms >= 0),
    beds                       smallint CHECK (beds >= 0),
    bathrooms                  numeric(3, 1) CHECK (bathrooms >= 0),
    area_sqm                   numeric(7, 2) CHECK (area_sqm > 0),

    currency                   currency_code NOT NULL DEFAULT 'SAR',
    base_nightly_rate_minor    money_minor,
    base_hourly_rate_minor     money_minor,
    min_hourly_duration_minutes integer NOT NULL DEFAULT 60
                               CHECK (min_hourly_duration_minutes BETWEEN 30 AND 720),

    -- Cleaning/turnaround buffer appended after checkout. Copied ONTO each
    -- booking at creation time — changing it here never mutates history.
    turnaround_minutes         integer NOT NULL DEFAULT 30
                               CHECK (turnaround_minutes BETWEEN 0 AND 240),

    instant_book               boolean NOT NULL DEFAULT true,
    status                     unit_status NOT NULL DEFAULT 'ACTIVE',
    photos                     jsonb NOT NULL DEFAULT '[]'::jsonb,

    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    deleted_at                 timestamptz,

    CONSTRAINT units_some_mode CHECK (supports_hourly OR supports_nightly),
    CONSTRAINT units_nightly_rate_required CHECK (
        NOT supports_nightly OR base_nightly_rate_minor IS NOT NULL
    ),
    CONSTRAINT units_hourly_rate_required CHECK (
        NOT supports_hourly OR base_hourly_rate_minor IS NOT NULL
    ),
    -- Composite key target so bookings can FK (unit_id, property_id) and the
    -- pair can never drift apart (no trigger needed for consistency).
    CONSTRAINT units_id_property_unique UNIQUE (id, property_id)
);

CREATE TRIGGER trg_units_touch
    BEFORE UPDATE ON units
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- unit_availability_blocks — non-booking occupancy: host personal use,
-- maintenance windows, external-calendar (iCal) sync. Its own exclusion
-- constraint prevents overlapping *blocks*; the cross-guard against bookings
-- lives in 0006 (advisory-lock trigger pair).
-- ---------------------------------------------------------------------------
CREATE TABLE unit_availability_blocks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id     uuid NOT NULL REFERENCES units (id),
    block_type  availability_block_type NOT NULL DEFAULT 'HOST_BLOCK',
    block_range tstzrange NOT NULL,
    reason      text,
    is_active   boolean NOT NULL DEFAULT true,
    created_by  uuid REFERENCES users (id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT blocks_nonempty CHECK (NOT isempty(block_range)),
    CONSTRAINT blocks_bounded  CHECK (
        NOT lower_inf(block_range) AND NOT upper_inf(block_range)
    ),
    CONSTRAINT blocks_no_overlap EXCLUDE USING gist (
        unit_id     WITH =,
        block_range WITH &&
    ) WHERE (is_active)
);

CREATE TRIGGER trg_blocks_touch
    BEFORE UPDATE ON unit_availability_blocks
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- unit_price_overrides — seasonal/weekend pricing per calendar period.
-- daterange (property-local dates) because pricing is a per-day business
-- concept; conversion to UTC instants happens at quote time in the service.
-- ---------------------------------------------------------------------------
CREATE TABLE unit_price_overrides (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id             uuid NOT NULL REFERENCES units (id),
    period              daterange NOT NULL CHECK (NOT isempty(period)),
    nightly_rate_minor  money_minor,
    hourly_rate_minor   money_minor,
    min_stay_nights     smallint CHECK (min_stay_nights >= 1),
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT price_overrides_some_rate CHECK (
        num_nonnulls(nightly_rate_minor, hourly_rate_minor) >= 1
    ),
    CONSTRAINT price_overrides_no_overlap EXCLUDE USING gist (
        unit_id WITH =,
        period  WITH &&
    )
);
