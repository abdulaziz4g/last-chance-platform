-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0002: Enumerated types and reusable domains
-- Depends on: 0001
--
-- Convention: enums are UPPER_SNAKE to mirror the TypeScript/Flutter enums 1:1
-- so serialization never needs a mapping layer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identity & actors
-- ---------------------------------------------------------------------------
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

CREATE TYPE kyc_status AS ENUM ('NOT_STARTED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- Who performed an action (FSM transitions, audit rows).
CREATE TYPE actor_type AS ENUM ('GUEST', 'HOST', 'ADMIN', 'SUPPORT', 'SYSTEM');

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
CREATE TYPE property_type AS ENUM (
    'HOTEL', 'APARTHOTEL', 'APARTMENT', 'VILLA', 'CHALET',
    'REST_HOUSE', 'RESORT', 'FARM_STAY', 'CAMP', 'LOUNGE'
);

CREATE TYPE property_status AS ENUM (
    'DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'DELISTED'
);

CREATE TYPE unit_type AS ENUM (
    'ROOM', 'SUITE', 'STUDIO', 'APARTMENT',
    'ENTIRE_VILLA', 'ENTIRE_CHALET', 'MEETING_ROOM', 'LOUNGE_SPACE'
);

CREATE TYPE unit_status AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- Host-initiated calendar blocks (non-booking occupancy).
CREATE TYPE availability_block_type AS ENUM ('HOST_BLOCK', 'MAINTENANCE', 'EXTERNAL_SYNC');

-- ---------------------------------------------------------------------------
-- Booking FSM
-- ---------------------------------------------------------------------------
CREATE TYPE booking_type AS ENUM ('HOURLY', 'NIGHTLY');

CREATE TYPE booking_status AS ENUM (
    'DRAFT',            -- guest is composing; holds no inventory
    'PENDING_PAYMENT',  -- 10-min payment hold; BLOCKS inventory
    'CONFIRMED',        -- paid & guaranteed; BLOCKS inventory
    'CHECKED_IN',       -- guest on premises;  BLOCKS inventory
    'COMPLETED',        -- stay finished; releases inventory, triggers payout
    'CANCELLED',        -- terminal-ish (may proceed to REFUNDED)
    'EXPIRED',          -- payment hold lapsed; inventory auto-released
    'REFUNDED'          -- terminal
);

CREATE TYPE booking_source AS ENUM ('WEB', 'IOS', 'ANDROID', 'ADMIN', 'API');

-- ---------------------------------------------------------------------------
-- Money movement
-- ---------------------------------------------------------------------------
CREATE TYPE payment_provider AS ENUM ('STRIPE', 'HYPERPAY', 'MOYASAR', 'TAP');

CREATE TYPE payment_method AS ENUM (
    'VISA', 'MASTERCARD', 'MADA', 'AMEX', 'APPLE_PAY', 'STC_PAY', 'OTHER'
);

CREATE TYPE payment_status AS ENUM (
    'INITIATED', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED',
    'FAILED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED'
);

CREATE TYPE refund_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TYPE webhook_status AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'SKIPPED');

CREATE TYPE payout_status AS ENUM (
    'PENDING', 'ON_HOLD', 'SCHEDULED', 'IN_TRANSIT', 'PAID', 'FAILED', 'REVERSED'
);

-- Escrow double-entry ledger accounts.
CREATE TYPE ledger_account AS ENUM (
    'PROVIDER_CLEARING',    -- money in transit at the PSP
    'PLATFORM_ESCROW',      -- guest funds held until checkout
    'PLATFORM_REVENUE',     -- earned commission + service fees
    'HOST_PAYABLE',         -- owed to hosts, pending payout
    'TAX_PAYABLE',          -- collected VAT/levies
    'GUEST_REFUND_CLEARING' -- refunds in flight back to guests
);

CREATE TYPE ledger_direction AS ENUM ('DEBIT', 'CREDIT');

-- ---------------------------------------------------------------------------
-- Deals & reviews
-- ---------------------------------------------------------------------------
CREATE TYPE flash_deal_status AS ENUM ('SCHEDULED', 'ACTIVE', 'SOLD_OUT', 'ENDED', 'CANCELLED');

CREATE TYPE review_status AS ENUM ('PENDING', 'PUBLISHED', 'REMOVED');

-- ---------------------------------------------------------------------------
-- Domains: single place to enforce cross-cutting value rules
-- ---------------------------------------------------------------------------

-- All money is stored in integer MINOR units (halalas, cents). Never floats.
CREATE DOMAIN money_minor AS bigint
    CHECK (VALUE >= 0);

-- ISO-4217 alpha code.
CREATE DOMAIN currency_code AS char(3)
    CHECK (VALUE ~ '^[A-Z]{3}$');

-- 0.00 .. 100.00
CREATE DOMAIN percentage AS numeric(5, 2)
    CHECK (VALUE >= 0 AND VALUE <= 100);

-- E.164 international phone format.
CREATE DOMAIN phone_e164 AS text
    CHECK (VALUE ~ '^\+[1-9][0-9]{6,14}$');
