-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0004: Identity (users, host profiles) + platform settings
-- Depends on: 0002, 0003
-- ============================================================================

-- ---------------------------------------------------------------------------
-- platform_settings — operational configuration read by services at boot and
-- cached; changing a value here never rewrites historical rows (bookings copy
-- the values they were created under).
-- ---------------------------------------------------------------------------
CREATE TABLE platform_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    description text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_platform_settings_touch
    BEFORE UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

INSERT INTO platform_settings (key, value, description) VALUES
    ('default_commission_pct',   '15.00', 'Platform commission % applied unless host has an override'),
    ('default_turnaround_minutes', '30',  'Cleaning/turnaround buffer appended to every booking'),
    ('payment_hold_minutes',       '10',  'PENDING_PAYMENT hold duration before auto-expiry'),
    ('max_hourly_booking_hours',   '12',  'Longest bookable hourly block');

-- ---------------------------------------------------------------------------
-- users — every human on the platform. A user *becomes* a host by acquiring a
-- host_profiles row (DDD: Host is a role aggregate, not a user subtype).
-- Soft-delete only (deleted_at); hard DELETE is revoked from the app role.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email              citext NOT NULL UNIQUE
                       CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    phone              phone_e164 UNIQUE,
    -- NULL for social-auth accounts; always an Argon2id hash, never plaintext.
    password_hash      text,
    auth_provider      text NOT NULL DEFAULT 'password'
                       CHECK (auth_provider IN ('password', 'google', 'apple')),
    full_name          text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200),
    avatar_url         text,
    date_of_birth      date,
    locale             text NOT NULL DEFAULT 'ar',
    preferred_currency currency_code NOT NULL DEFAULT 'SAR',
    status             user_status NOT NULL DEFAULT 'ACTIVE',
    email_verified_at  timestamptz,
    phone_verified_at  timestamptz,
    last_login_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    deleted_at         timestamptz,

    CONSTRAINT users_password_present CHECK (
        auth_provider <> 'password' OR password_hash IS NOT NULL
    )
);

CREATE TRIGGER trg_users_touch
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- host_profiles — 1:1 extension of users for hosting capability.
-- Payout bank details are NOT stored here: they live tokenized at the payment
-- provider (PCI/PII isolation); we keep only the provider account reference.
-- ---------------------------------------------------------------------------
CREATE TABLE host_profiles (
    user_id                 uuid PRIMARY KEY REFERENCES users (id),
    display_name            text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
    bio                     text,
    kyc_status              kyc_status NOT NULL DEFAULT 'NOT_STARTED',
    kyc_verified_at         timestamptz,
    -- NULL = platform default from platform_settings.
    commission_pct_override percentage,
    payout_currency         currency_code NOT NULL DEFAULT 'SAR',
    -- e.g. Stripe Connect acct_... ; the only payout credential we hold.
    payout_provider_ref     text,
    rating_avg              numeric(3, 2) CHECK (rating_avg BETWEEN 1 AND 5),
    rating_count            integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    is_superhost            boolean NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_host_profiles_touch
    BEFORE UPDATE ON host_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
