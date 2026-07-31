-- ============================================================================
-- Last Chance Platform — Phase 7: Regulatory moderation & Saudi compliance
-- Migration 0016: property moderation FSM, regulatory documents, tokenized
--                 host identity, privacy-preserving approximate location
-- Depends on: 0004 (identity), 0005 (inventory), 0010 (audit)
--
-- THREE MODELLING DECISIONS, made deliberately — read before extending:
--
-- 1. MODERATION IS ITS OWN AXIS. units.status stays operational
--    (ACTIVE/INACTIVE/MAINTENANCE); regulatory state lives in
--    properties.moderation_status. A unit can be permanently APPROVED and
--    still be offline for MAINTENANCE this week. Folding the two together
--    would mean a host re-tiling a bathroom has to leave the approved state
--    and beg an admin to get back in.
--
--    Public visibility is therefore a CONJUNCTION, not a single column:
--        property APPROVED  AND  property ACTIVE  AND  unit ACTIVE
--        AND neither soft-deleted
--    v_public_units below is the single canonical expression of that rule.
--    Every read path should go through it rather than re-deriving it — the
--    old `u.status = 'ACTIVE'` filters are exactly the drift this prevents.
--
-- 2. DOCUMENTS AND APPROVAL SIT ON THE PROPERTY. A Title Deed describes a
--    building, not a room inside it: a 20-unit aparthotel has one deed, not
--    twenty. Units inherit their property's approval.
--
-- 3. NO RAW REGULATED PII IS STORED. National ID / Iqama and IBAN are kept as
--    salted hash (for matching) + last-4 (for display) + provider reference.
--    This is not caution for its own sake: fn_audit_row() snapshots whole rows
--    into an append-only table the app role cannot UPDATE or DELETE, so a raw
--    identifier written once is unerasable by construction — a PDPL erasure
--    obligation the platform could not honour. The strip-list is extended
--    below as a second line of defence.
--
-- RUN AS ONE TRANSACTION. psql -f autocommits statement by statement, so a
-- failure partway through leaves the database half-migrated with no record of
-- how far it got. This migration is large enough that the difference matters:
-- the first attempt against the dev database died on host_profiles AFTER the
-- properties columns had already committed, and had to be unwound by hand.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE moderation_status AS ENUM (
    'DRAFT',            -- host is still composing; invisible to everyone else
    'PENDING_APPROVAL', -- submitted; sitting in the admin review queue
    'APPROVED',         -- cleared by an admin; eligible for search/map
    'REJECTED',         -- refused with a reason; host may fix and resubmit
    'SUSPENDED'         -- previously approved, pulled by an admin
);

CREATE TYPE moderation_reason_code AS ENUM (
    'DOCUMENT_ILLEGIBLE',
    'DOCUMENT_EXPIRED',
    'DEED_NAME_MISMATCH',
    'PERMIT_INVALID',
    'PERMIT_NOT_FOUND',
    'NATIONAL_ADDRESS_MISMATCH',
    'LOCATION_MISMATCH',
    'PHOTOS_INSUFFICIENT',
    'PROHIBITED_CONTENT',
    'DUPLICATE_LISTING',
    'OTHER'
);

CREATE TYPE property_document_type AS ENUM (
    'TITLE_DEED',
    'LEASE_CONTRACT',
    'TOURISM_PERMIT',
    'NATIONAL_ADDRESS_CERT',
    'OTHER'
);

CREATE TYPE national_id_type AS ENUM ('NATIONAL_ID', 'IQAMA');

-- ---------------------------------------------------------------------------
-- properties — moderation state + Saudi National Address + permit
--
-- The Saudi National Address short code is 4 letters + 4 digits (e.g.
-- RIYD2342); building number and additional number are both 4 digits.
-- ---------------------------------------------------------------------------
ALTER TABLE properties
    ADD COLUMN moderation_status     moderation_status NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN submitted_at          timestamptz,
    ADD COLUMN approved_at           timestamptz,
    ADD COLUMN approved_by           uuid REFERENCES users (id),

    ADD COLUMN national_short_address text
        CHECK (national_short_address ~ '^[A-Z]{4}[0-9]{4}$'),
    ADD COLUMN building_number        text CHECK (building_number ~ '^[0-9]{4}$'),
    ADD COLUMN additional_number      text CHECK (additional_number ~ '^[0-9]{4}$'),
    ADD COLUMN district               text,

    ADD COLUMN tourism_permit_number  text,
    ADD COLUMN tourism_permit_expires_at date,

    -- Privacy guard. See fn_property_set_approx_location below for why this is
    -- STORED rather than fuzzed per request.
    ADD COLUMN approx_location        geography(Point, 4326);

-- An APPROVED property must actually carry the paperwork that approval
-- attests to. Enforced at the database, not only in the admin UI, because
-- "approved without a permit on file" is precisely the state a regulator asks
-- about.
ALTER TABLE properties ADD CONSTRAINT properties_approved_requires_compliance CHECK (
    moderation_status <> 'APPROVED'
    OR (
        national_short_address IS NOT NULL
        AND tourism_permit_number IS NOT NULL
        AND tourism_permit_expires_at IS NOT NULL
    )
);

CREATE INDEX idx_properties_moderation ON properties (moderation_status, submitted_at)
    WHERE deleted_at IS NULL;

-- The admin review queue: small, hot, and read on every dashboard poll.
CREATE INDEX idx_properties_review_queue ON properties (submitted_at)
    WHERE moderation_status = 'PENDING_APPROVAL' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Approximate location — the privacy guard, computed ONCE and stored.
--
-- WHY NOT FUZZ PER REQUEST: a random offset re-rolled on every read is not
-- privacy, it is a slow leak. An observer who fetches the same listing n times
-- averages the noise away and recovers the true point to arbitrary precision.
-- A single deterministic offset derived from the property id gives every
-- viewer the same displaced circle forever, so repeated observation reveals
-- nothing further.
--
-- Bearing is uniform over the compass and distance lands in [250, 500] m, so
-- the true point is never at the centre of the rendered circle.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_property_set_approx_location() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_hash    bigint;
    v_bearing double precision;
    v_metres  double precision;
BEGIN
    v_hash    := hashtextextended('approx-location:' || NEW.id::text, 0);
    v_bearing := (abs(v_hash % 3600))::double precision / 3600.0 * 2 * pi();
    v_metres  := 250 + (abs((v_hash / 3600) % 251))::double precision;
    NEW.approx_location := ST_Project(NEW.location, v_metres, v_bearing);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_properties_approx_location
    BEFORE INSERT OR UPDATE OF location ON properties
    FOR EACH ROW EXECUTE FUNCTION fn_property_set_approx_location();

-- Backfill existing rows (the trigger only fires on write).
UPDATE properties SET location = location;

ALTER TABLE properties ALTER COLUMN approx_location SET NOT NULL;

-- Map/viewport search reads the approximate point, never the true one, so the
-- index that serves public traffic is this one.
CREATE INDEX idx_properties_approx_geo ON properties USING gist (approx_location);

-- ---------------------------------------------------------------------------
-- host_profiles — tokenized identity. No raw identifier is ever stored.
--
-- national_id_hash is a salted digest for duplicate detection and for matching
-- against a KYC provider's answer; national_id_last4 is display-only
-- ("••••1234"). The authoritative copy lives with the KYC vendor, addressed by
-- kyc_provider_ref. Same shape for the payout account: last-4 plus the existing
-- payout_provider_ref, never the IBAN itself.
-- ---------------------------------------------------------------------------
ALTER TABLE host_profiles
    ADD COLUMN national_id_type    national_id_type,
    ADD COLUMN national_id_hash    text,
    ADD COLUMN national_id_last4   char(4) CHECK (national_id_last4 ~ '^[0-9]{4}$'),
    ADD COLUMN kyc_provider_ref    text,
    ADD COLUMN iban_last4          char(4) CHECK (iban_last4 ~ '^[0-9A-Z]{4}$'),
    ADD COLUMN iban_bank_code      text;

-- A verified host must have something to verify against.
--
-- NOT VALID is deliberate and is not a formality: hosts verified before this
-- migration have no identity on file by definition, and there is no honest way
-- to synthesise one. Retroactively demoting them to NOT_STARTED is a business
-- decision about real accounts, not something a schema migration should take
-- unilaterally. So legacy rows are grandfathered and every new write is
-- enforced. To finish the job, re-verify those hosts through the KYC flow and
-- then run:
--     ALTER TABLE host_profiles VALIDATE CONSTRAINT host_profiles_verified_requires_identity;
-- Find them with:
--     SELECT user_id FROM host_profiles
--      WHERE kyc_status = 'VERIFIED' AND national_id_hash IS NULL;
ALTER TABLE host_profiles ADD CONSTRAINT host_profiles_verified_requires_identity CHECK (
    kyc_status <> 'VERIFIED'
    OR (national_id_hash IS NOT NULL AND national_id_type IS NOT NULL)
) NOT VALID;

-- Duplicate-identity detection: one national ID cannot back two host accounts.
CREATE UNIQUE INDEX idx_host_national_id_unique ON host_profiles (national_id_hash)
    WHERE national_id_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- property_documents — the regulatory paperwork behind an approval.
--
-- Only the object-storage key is held here; bytes live in S3 behind signed,
-- short-lived URLs. Admin review notes are per-document so a rejection can
-- point at the specific file that failed.
-- ---------------------------------------------------------------------------
CREATE TABLE property_documents (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id   uuid NOT NULL REFERENCES properties (id),
    document_type property_document_type NOT NULL,

    storage_key   text NOT NULL,
    file_name     text NOT NULL,
    content_type  text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes    integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20 * 1024 * 1024),

    issued_on     date,
    expires_on    date,

    uploaded_by   uuid NOT NULL REFERENCES users (id),
    verified_by   uuid REFERENCES users (id),
    verified_at   timestamptz,
    review_note   text,

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz,

    CONSTRAINT property_documents_valid_dates CHECK (
        expires_on IS NULL OR issued_on IS NULL OR expires_on > issued_on
    ),
    CONSTRAINT property_documents_verified_pair CHECK (
        (verified_by IS NULL) = (verified_at IS NULL)
    )
);

CREATE TRIGGER trg_property_documents_touch
    BEFORE UPDATE ON property_documents
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE INDEX idx_property_documents_property ON property_documents (property_id, document_type)
    WHERE deleted_at IS NULL;

-- One live document of each type per property; superseding means soft-deleting
-- the old one first, which keeps the replacement history intact.
CREATE UNIQUE INDEX idx_property_documents_one_live
    ON property_documents (property_id, document_type)
    WHERE deleted_at IS NULL AND document_type <> 'OTHER';

-- ---------------------------------------------------------------------------
-- Moderation FSM — data plus a trigger, exactly like booking_fsm_transitions.
-- The NestJS moderation service loads this table at boot; the trigger is the
-- authority. Same two-layer arrangement, same reasoning: a buggy service or a
-- manual psql session must not be able to invent an approval.
-- ---------------------------------------------------------------------------
CREATE TABLE property_moderation_transitions (
    from_status moderation_status NOT NULL,
    to_status   moderation_status NOT NULL,
    description text NOT NULL,
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO property_moderation_transitions (from_status, to_status, description) VALUES
    ('DRAFT',            'PENDING_APPROVAL', 'Host submits the completed listing wizard'),
    ('PENDING_APPROVAL', 'APPROVED',         'Admin cleared documents and permit'),
    ('PENDING_APPROVAL', 'REJECTED',         'Admin refused with a reason code'),
    ('PENDING_APPROVAL', 'DRAFT',            'Host withdrew the submission to edit it'),
    ('REJECTED',         'PENDING_APPROVAL', 'Host fixed the cited issue and resubmitted'),
    ('APPROVED',         'SUSPENDED',        'Admin pulled a live listing'),
    ('APPROVED',         'PENDING_APPROVAL', 'Material change or permit expiry forces re-review'),
    ('SUSPENDED',        'APPROVED',         'Admin reinstated the listing'),
    ('SUSPENDED',        'REJECTED',         'Suspension made permanent');

-- ---------------------------------------------------------------------------
-- property_moderation_events — append-only decision log. This is the record a
-- regulator or an appealing host is shown: who decided what, when, and why.
-- Immutability enforced by trigger (LC403) and by privilege revocation below.
-- ---------------------------------------------------------------------------
CREATE TABLE property_moderation_events (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id  uuid NOT NULL REFERENCES properties (id),
    from_status  moderation_status,
    to_status    moderation_status NOT NULL,
    actor_type   actor_type NOT NULL,
    actor_id     uuid,
    reason_code  moderation_reason_code,
    notes        text,
    request_id   text,
    created_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_moderation_events_property
    ON property_moderation_events (property_id, created_at DESC);

CREATE TRIGGER trg_moderation_events_immutable
    BEFORE UPDATE OR DELETE ON property_moderation_events
    FOR EACH ROW EXECUTE FUNCTION fn_forbid_mutation();

-- ---------------------------------------------------------------------------
-- Trigger 1 — moderation FSM guard. LC410 = illegal moderation transition.
-- A rejection without a reason code is itself illegal: "REJECTED, no reason"
-- is not a decision a host can act on or appeal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_property_moderation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
        IF NOT EXISTS (
            SELECT 1 FROM property_moderation_transitions t
            WHERE t.from_status = OLD.moderation_status
              AND t.to_status   = NEW.moderation_status
        ) THEN
            RAISE EXCEPTION 'Illegal moderation transition: % -> %',
                OLD.moderation_status, NEW.moderation_status
                USING ERRCODE = 'LC410';
        END IF;

        IF NEW.moderation_status = 'PENDING_APPROVAL' THEN
            NEW.submitted_at := now();
        ELSIF NEW.moderation_status = 'APPROVED' THEN
            NEW.approved_at  := now();
            NEW.approved_by  := fn_current_actor_id();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_properties_moderation_guard
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION fn_property_moderation_guard();

-- ---------------------------------------------------------------------------
-- Trigger 2 — log every moderation decision. Reason code and notes travel via
-- SET LOCAL app.moderation_reason / app.moderation_notes, mirroring the
-- existing app.actor_id / app.request_id contract.
--
-- A REJECTED transition with no reason code is refused outright (LC411).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_property_moderation_log() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_reason moderation_reason_code;
    v_notes  text;
BEGIN
    IF NEW.moderation_status IS NOT DISTINCT FROM OLD.moderation_status THEN
        RETURN NULL;
    END IF;

    BEGIN
        v_reason := NULLIF(current_setting('app.moderation_reason', true), '')::moderation_reason_code;
    EXCEPTION WHEN OTHERS THEN
        v_reason := NULL;
    END;
    v_notes := NULLIF(current_setting('app.moderation_notes', true), '');

    IF NEW.moderation_status = 'REJECTED' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'A rejection requires a reason code (SET LOCAL app.moderation_reason)'
            USING ERRCODE = 'LC411';
    END IF;

    INSERT INTO property_moderation_events
        (property_id, from_status, to_status, actor_type, actor_id,
         reason_code, notes, request_id)
    VALUES
        (NEW.id, OLD.moderation_status, NEW.moderation_status,
         fn_current_actor_type(), fn_current_actor_id(),
         v_reason, v_notes, fn_current_request_id());

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_properties_moderation_log
    AFTER UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION fn_property_moderation_log();

-- ---------------------------------------------------------------------------
-- v_public_units — THE canonical public-visibility rule.
--
-- Before this migration, six independent query sites each spelled out their own
-- version of "is this bookable" as `u.status = 'ACTIVE' AND p.status = 'ACTIVE'`.
-- Adding a second axis to that arrangement would have meant six chances to
-- forget the new predicate, and forgetting it means an unapproved listing on
-- the public map. One view, one rule.
--
-- Exposes approx_location for map rendering and keeps the true `location`
-- available for post-booking reveal — callers choose deliberately.
-- ---------------------------------------------------------------------------
CREATE VIEW v_public_units AS
SELECT
    u.id                AS unit_id,
    u.property_id,
    u.name              AS unit_name,
    u.unit_type,
    u.unit_group_key,
    u.supports_hourly,
    u.supports_nightly,
    u.max_guests,
    u.currency,
    u.base_nightly_rate_minor,
    u.base_hourly_rate_minor,
    u.min_hourly_duration_minutes,
    u.turnaround_minutes,
    u.instant_book,
    u.photos,
    p.host_id,
    p.name              AS property_name,
    p.slug              AS property_slug,
    p.property_type,
    p.city,
    p.district,
    p.country_code,
    p.timezone,
    p.rating_avg,
    p.rating_count,
    p.amenities,
    p.location          AS exact_location,
    p.approx_location
FROM units u
JOIN properties p ON p.id = u.property_id
WHERE u.status = 'ACTIVE'
  AND u.deleted_at IS NULL
  AND p.status = 'ACTIVE'
  AND p.deleted_at IS NULL
  AND p.moderation_status = 'APPROVED';

-- ---------------------------------------------------------------------------
-- Audit strip-list extended.
--
-- Tokenization already keeps raw identifiers out of the database, so nothing
-- here is currently sensitive — this exists so that if someone later adds a
-- raw column under one of these names, it does not silently start flowing into
-- an append-only table that cannot be redacted afterwards.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_old     jsonb;
    v_new     jsonb;
    v_changed text[];
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := to_jsonb(OLD) - 'password_hash'
                               - 'national_id' - 'national_id_hash'
                               - 'iban' - 'iban_hash';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := to_jsonb(NEW) - 'password_hash'
                               - 'national_id' - 'national_id_hash'
                               - 'iban' - 'iban_hash';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(o.key) INTO v_changed
        FROM jsonb_each(v_old) AS o
        WHERE (v_new -> o.key) IS DISTINCT FROM o.value;
    END IF;

    INSERT INTO audit_log
        (schema_name, table_name, record_pk, action,
         actor_type, actor_id, request_id,
         old_data, new_data, changed_fields)
    VALUES
        (TG_TABLE_SCHEMA, TG_TABLE_NAME,
         COALESCE(v_new ->> 'id', v_old ->> 'id',
                  v_new ->> 'user_id', v_old ->> 'user_id', '?'),
         TG_OP,
         fn_current_actor_type(), fn_current_actor_id(), fn_current_request_id(),
         v_old, v_new, v_changed);

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_property_documents
    AFTER INSERT OR UPDATE OR DELETE ON property_documents
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ---------------------------------------------------------------------------
-- Privileges, consistent with 0012: the app role may read and write, never
-- destroy history, and never edit the moderation rule table (that is schema).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON property_documents TO lastchance_app;
GRANT SELECT, INSERT ON property_moderation_events TO lastchance_app;
GRANT SELECT ON property_moderation_transitions TO lastchance_app;
GRANT SELECT ON v_public_units TO lastchance_app;
REVOKE UPDATE, DELETE ON property_moderation_events FROM lastchance_app;

COMMIT;
