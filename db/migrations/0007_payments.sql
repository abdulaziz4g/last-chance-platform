-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0007: Payments, refunds, webhooks, payouts, escrow ledger
-- Depends on: 0006
--
-- PCI note: no PAN, CVV, or bank account numbers are EVER stored. We keep
-- only provider-side tokens/references. Card data lives at the PSP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- payments — one row per payment attempt against a booking.
-- Idempotency is two-layered:
--   * idempotency_key: our key, sent to the provider on create (safe retries)
--   * (provider, provider_payment_id): dedupes provider-side objects
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id            uuid NOT NULL REFERENCES bookings (id),
    provider              payment_provider NOT NULL,
    method                payment_method NOT NULL,
    status                payment_status NOT NULL DEFAULT 'INITIATED',

    idempotency_key       text NOT NULL UNIQUE,
    provider_payment_id   text,
    provider_customer_id  text,

    amount_minor          money_minor NOT NULL CHECK (amount_minor > 0),
    currency              currency_code NOT NULL,
    refunded_amount_minor money_minor NOT NULL DEFAULT 0,

    authorized_at         timestamptz,
    captured_at           timestamptz,
    failed_at             timestamptz,
    failure_code          text,
    failure_message       text,

    metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT payments_refund_within_amount CHECK (refunded_amount_minor <= amount_minor),
    CONSTRAINT payments_provider_object_unique UNIQUE (provider, provider_payment_id)
);

CREATE TRIGGER trg_payments_touch
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- refunds — partial or full, always tied to an original payment.
-- ---------------------------------------------------------------------------
CREATE TABLE refunds (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id          uuid NOT NULL REFERENCES payments (id),
    provider_refund_id  text,
    status              refund_status NOT NULL DEFAULT 'PENDING',
    amount_minor        money_minor NOT NULL CHECK (amount_minor > 0),
    currency            currency_code NOT NULL,
    reason              text,
    initiated_by        actor_type NOT NULL DEFAULT 'SYSTEM',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT refunds_provider_object_unique UNIQUE (payment_id, provider_refund_id)
);

CREATE TRIGGER trg_refunds_touch
    BEFORE UPDATE ON refunds
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- payment_webhook_events — EVERY inbound provider webhook lands here first.
-- UNIQUE (provider, event_id) is the idempotency backbone: a redelivered
-- webhook hits ON CONFLICT DO NOTHING and is never processed twice.
-- Processing is asynchronous (BullMQ picks up RECEIVED rows).
-- ---------------------------------------------------------------------------
CREATE TABLE payment_webhook_events (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider          payment_provider NOT NULL,
    event_id          text NOT NULL,
    event_type        text NOT NULL,
    payload           jsonb NOT NULL,
    signature_valid   boolean NOT NULL,
    processing_status webhook_status NOT NULL DEFAULT 'RECEIVED',
    attempts          integer NOT NULL DEFAULT 0,
    last_error        text,
    received_at       timestamptz NOT NULL DEFAULT now(),
    processed_at      timestamptz,

    CONSTRAINT webhooks_event_unique UNIQUE (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- payouts — host settlement per completed booking (escrow release).
-- UNIQUE (booking_id): a booking can never be paid out twice.
-- ---------------------------------------------------------------------------
CREATE TABLE payouts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id              uuid NOT NULL REFERENCES host_profiles (user_id),
    booking_id           uuid NOT NULL UNIQUE REFERENCES bookings (id),
    status               payout_status NOT NULL DEFAULT 'PENDING',
    amount_minor         money_minor NOT NULL CHECK (amount_minor > 0),
    currency             currency_code NOT NULL,
    provider             payment_provider,
    provider_transfer_id text,
    scheduled_for        timestamptz,
    initiated_at         timestamptz,
    paid_at              timestamptz,
    failure_message      text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_payouts_touch
    BEFORE UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- ledger_entries — append-only double-entry ledger for the escrow model.
-- Every money movement writes a balanced GROUP of legs sharing entry_group_id:
--
--   Capture:   DEBIT PROVIDER_CLEARING      / CREDIT PLATFORM_ESCROW (total)
--   Checkout:  DEBIT PLATFORM_ESCROW        / CREDIT HOST_PAYABLE (host share)
--                                             CREDIT PLATFORM_REVENUE (commission+fees)
--                                             CREDIT TAX_PAYABLE (VAT)
--   Payout:    DEBIT HOST_PAYABLE           / CREDIT PROVIDER_CLEARING
--   Refund:    DEBIT PLATFORM_ESCROW        / CREDIT GUEST_REFUND_CLEARING
--
-- Balance (sum debits = sum credits, single currency per group) is enforced
-- by a DEFERRED constraint trigger at COMMIT — an unbalanced transaction
-- cannot exist, even transiently across statements.
-- ---------------------------------------------------------------------------
CREATE TABLE ledger_entries (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entry_group_id uuid NOT NULL,
    account        ledger_account NOT NULL,
    direction      ledger_direction NOT NULL,
    amount_minor   money_minor NOT NULL CHECK (amount_minor > 0),
    currency       currency_code NOT NULL,
    booking_id     uuid REFERENCES bookings (id),
    payment_id     uuid REFERENCES payments (id),
    payout_id      uuid REFERENCES payouts (id),
    host_id        uuid REFERENCES host_profiles (user_id),
    description    text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION fn_assert_ledger_group_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_debits     numeric;
    v_credits    numeric;
    v_currencies integer;
BEGIN
    SELECT
        COALESCE(sum(amount_minor) FILTER (WHERE direction = 'DEBIT'),  0),
        COALESCE(sum(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0),
        count(DISTINCT currency)
    INTO v_debits, v_credits, v_currencies
    FROM ledger_entries
    WHERE entry_group_id = NEW.entry_group_id;

    IF v_debits <> v_credits THEN
        RAISE EXCEPTION 'Unbalanced ledger group %: debits % <> credits %',
            NEW.entry_group_id, v_debits, v_credits
            USING ERRCODE = 'LC422';
    END IF;

    IF v_currencies <> 1 THEN
        RAISE EXCEPTION 'Ledger group % mixes currencies', NEW.entry_group_id
            USING ERRCODE = 'LC422';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_ledger_group_balanced
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_assert_ledger_group_balanced();
