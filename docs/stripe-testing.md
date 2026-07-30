# Testing Stripe end to end

The platform ships with a dev `MOCK` provider so checkout works with no
credentials. Stripe is fully wired but dormant: the registry only registers it
once its keys are present, and `GET /payments/config` reports which provider is
actually live. Nothing below changes application code — it is all configuration.

## What you need

- The stack running (`docker compose up -d postgres redis opensearch jaeger`,
  then the backend and web).
- A Stripe account in **test mode**. No real money moves; test mode has its own
  keys and its own dashboard data.
- The [Stripe CLI](https://stripe.com/docs/stripe-cli), to deliver webhooks to
  localhost. Stripe cannot reach your machine on its own.

  On Windows:

  ```bash
  winget install --id Stripe.StripeCLI
  ```

  winget does not refresh the PATH of terminals that are already open, so the
  `stripe` command will look missing in the shell you installed from even
  though it installed fine. Open a new terminal before concluding anything is
  wrong. Then authenticate once with `stripe login`, which writes
  `~/.config/stripe/config.toml` — the presence of that file is the quickest
  way to confirm the CLI is actually set up.

## 1. Add your keys

All three go in `backend/.env` (copy `backend/.env.example` if you have not
already). Put them in the file yourself — they are credentials, so don't paste
them into a chat, a commit, or a terminal command that gets logged.

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

The secret and webhook secret enable the provider server-side; the publishable
key is what the browser needs to load Stripe.js. **All three are required
together** — with the first two set but not the third, `/payments/config`
reports STRIPE with a null key and the card form cannot mount.

There is no dotenv dependency here: `backend/.env` is read by Node itself via
`--env-file-if-exists`, which is passed by the `start` / `start:dev` scripts and
by the `backend` entry in `.claude/launch.json`. **Start the backend one of
those ways.** Launched any other way the file is simply never read, and the
symptom is indistinguishable from a typo in the keys.

`STRIPE_WEBHOOK_SECRET` comes from step 2, so expect to fill it in second.

## 2. Forward webhooks to localhost

```bash
stripe listen --forward-to localhost:3000/webhooks/payments/stripe
```

It prints a signing secret (`whsec_...`) on start. That is the value for
`STRIPE_WEBHOOK_SECRET`. Leave this running for the whole session — the booking
is confirmed by the webhook, not by the browser, so without it a payment
succeeds at Stripe and the booking stays `PENDING_PAYMENT`.

Restart the backend after editing `.env`.

## 3. Confirm Stripe is actually live

```bash
curl -s http://localhost:3000/payments/config
```

Expect `{"provider":"STRIPE","enabled":["MOCK","STRIPE"],"publishableKey":"pk_test_..."}`.

If it still says `provider: "MOCK"`, the keys did not load. In order of
likelihood: the backend was started without `--env-file-if-exists` (see step 1),
it was not restarted after the edit, or the keys are still commented out. The
checkout page reads this endpoint, so this is the single check that decides
which flow you get.

## 4. Walk a payment through

1. Register or sign in, then **Discover → View stay → Book this stay**.
2. Place a hold. The booking is `PENDING_PAYMENT` with a 10-minute expiry.
3. On the pay screen the button now reads **Continue to card details** rather
   than *Pay now* — that difference is how you know you are on the Stripe path.
   Only card methods are offered, because the intent is created for cards.
4. Press it. The server creates a PaymentIntent and hands the client secret to
   the browser; Stripe's Payment Element mounts in an iframe. Card details go
   from the browser straight to Stripe and never touch this application.
5. Pay with a Stripe test card — `4242 4242 4242 4242`, any future expiry, any
   CVC, any postcode. For the Saudi **mada** path use a mada test card from
   Stripe's [testing docs](https://stripe.com/docs/testing); the intent sets
   `payment_method_options[card][network]=mada` when the method is MADA.
6. Stripe redirects back to `/book/confirmation?bookingId=…`.

## 5. Check it actually settled

The redirect only means Stripe accepted the card. Confirmation comes from the
webhook, so verify the pipeline rather than the page:

- The `stripe listen` terminal should show `payment_intent.succeeded` forwarded
  with a `200`.
- The booking should move to `CONFIRMED` — visible on **My bookings**, or:
  ```bash
  curl -s http://localhost:3000/bookings/<id> -H "Authorization: Bearer <token>"
  ```
- The ledger should balance. In the admin console, **Escrow ledger** should show
  the captured amount in `PLATFORM_ESCROW`, with the commission and VAT split
  booked. Every entry group balances at COMMIT — the database enforces it.

## 6. Exercise a refund

Cancel the confirmed booking from **My bookings**. That enqueues a refund, which
Stripe settles asynchronously:

- `stripe listen` shows `charge.refunded` (or `refund.updated`) forwarded.
- The booking moves `CANCELLED → REFUNDED`.
- The refund row lands with reason `cancelled_by_guest`, and the escrow entries
  net to zero for that booking.

## Things that will bite

- **No `stripe listen` running.** Payment succeeds at Stripe, booking never
  confirms. The most common cause of "it didn't work".
- **Stale webhook secret.** `stripe listen` mints a new one each start unless you
  pass `--api-key`/use a fixed endpoint. A mismatched secret fails signature
  verification and the intake returns 400 — by design, an unverified webhook is
  never processed.
- **Signature tolerance.** Events older than 300 seconds are rejected as
  replays, so a paused-and-resumed CLI can produce confusing failures.
- **Going back to MOCK.** Comment the three keys out and restart. The registry
  drops Stripe and `/payments/config` reports MOCK again; nothing else changes.

## What is verified, and what is not

The webhook half — signature verification, event normalisation, and the
booking/ledger/refund pipeline behind it — is covered by
`backend/scripts/integration-smoke-payments.ts`, which drives the same code
paths through the MOCK provider (21 assertions, including capture, payout split,
VAT, cancellation and refund settlement).

What that does **not** cover, and what this runbook exists to exercise, is the
Stripe-specific edge: real `PaymentIntent` creation against `api.stripe.com`,
Stripe's own signature format, and the browser-side Payment Element. Those have
never been run against a live Stripe account.

One thing worth knowing before you compare behaviour: the MOCK provider has no
callback daemon. Nothing ever posts its settlement webhook on its own, so a
MOCK refund sits at `PENDING` until one is played by hand — that is correct, not
a stuck job. `stripe listen` is exactly what fills that role here, which is why
step 6 has a step MOCK does not.
