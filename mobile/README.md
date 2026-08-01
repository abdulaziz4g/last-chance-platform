# Last Chance — Mobile (Phase 5)

Flutter (iOS & Android), Clean Architecture + Riverpod. Dark-luxury theme
matching the web console (ink canvas, brass accent).

## Layout

```
lib/
  main.dart / app/            ProviderScope, MaterialApp, theme
  core/
    config.dart               dart-define build config (API host, demo ids)
    money.dart                minor-units formatting + countdown mm:ss
    api/                      Dio client + error-envelope -> ApiException
  features/
    booking/
      domain/                 Booking entity + enums, 1:1 wire mirror of the API
      data/                   BookingRepository + BookingWatcher (poll stream)
      application/            HoldFlowController — the guest-side hold FSM
                              (idle -> placing -> active -> confirmed/expired/failed);
                              placeHold AND claimDeal both land in HoldActive
      presentation/           HoldCountdown (the 10-min signature UX),
                              hold_flow_views (shared active/confirmed/notice views),
                              booking flow screen
    payment/data/             PaymentRepository (initiate -> provider clientAction)
    deals/
      domain/                 FlashDeal (1:1 with GET /deals/active) + net-rate math;
                              AvailabilityEvent + AvailabilityFeed (WS contract)
      data/                   DealRepository (getActiveDeals, claim -> Booking)
      application/            DealsFeedController (AsyncNotifier live feed)
      presentation/           DealsScreen (home: live cards + local countdowns),
                              DealClaimScreen (offer + day picker -> shared hold flow)
test/
  money_test.dart             formatting invariants
  booking_domain_test.dart    enum mirrors, JSON parsing, DB-constraint mirror
  flash_deal_test.dart        deal parsing, net-rate math, countdown clamp
  hold_countdown_test.dart    widget test with injected clock (single onExpired)
  live_api_test.dart          @Skip'd — full booking cycle vs the live backend
  live_deals_test.dart        @Skip'd — deal claim -> discounted hold vs backend
```

## Flash-deal claim flow

`DealsScreen` (the home) renders the live `GET /deals/active` feed with
struck-through pricing, remaining inventory, and countdowns that tick locally.
Tapping a deal opens `DealClaimScreen` (offer + a stay-day picker); "Reserve"
calls `HoldFlowController.claimDeal`, which hits `POST /deals/{id}/claim`. The
backend atomically decrements inventory and returns a **discounted
PENDING_PAYMENT booking**, so the flow hands straight off to the SAME shared
hold-countdown + payment views as a normal booking (`hold_flow_views.dart`).
`FLASH_DEAL_SOLD_OUT` and `UNIT_UNAVAILABLE` get their own honest messages
(the latter notes "your deal slot was not used").

## Architecture decisions

- **Wire enums are the source of truth**: `BookingStatus.holdsInventory`
  mirrors the DB exclusion-constraint predicate and is tested against it.
- **No codegen** (freezed/riverpod_generator) in v1 — hand-written immutable
  classes and notifiers keep the toolchain minimal; codegen is an additive
  refactor later.
- **Confirmation is observed, not assumed**: after payment initiation the
  screen watches the booking (polling now, WS push in Phase 6) so the
  webhook-driven CONFIRMED/EXPIRED transition drives the UI — the same
  contract as production PSP flows.
- **Money is integer minor units** end to end; doubles exist only inside
  `formatMinor`. All instants UTC.

## Running

```powershell
cd mobile
flutter pub get
flutter analyze && flutter test          # live test auto-skipped
# Full live-cycle test (backend + docker stack must be up):
#   $env:LC_TEST_GUEST_ID='<uuid>'; $env:LC_TEST_UNIT_ID='<uuid>'
#   flutter test --run-skipped test/live_api_test.dart
# On a device/emulator against local backend:
flutter run --dart-define=LC_API=http://10.0.2.2:3000 `
            --dart-define=LC_GUEST_ID=<uuid> --dart-define=LC_UNIT_ID=<uuid>
```

Verified 2026-07-23: `flutter analyze` 0 issues; 13 tests pass (2 live tests
skipped by default). Live deal-claim test proven against the running backend —
listed a deal, claimed it, got a discounted hold with flash_deal_id set and
discount == the deal's % of base.

Next iterations: discovery/search screens (OpenSearch), WS push replacing the
deal-feed poll (AvailabilityFeed contract already typed), PSP SDK handoff
replacing the dev confirm shortcut, JWT auth replacing dev headers.

## Map tiles (Mapbox)

The map runs without a token: `NoTokenTileLayer` draws a pannable AlUla field
under real pins, so pricing, clustering, selection and the privacy circle are
all usable and testable. Supplying a token swaps in the real tiles with no code
change.

```bash
flutter run --dart-define=MAPBOX_ACCESS_TOKEN=pk.xxxxx
# optional, to use a Mapbox Studio style instead of the code-based AlUla theme
flutter run --dart-define=MAPBOX_STYLE_URI=mapbox://styles/<user>/<style-id>
```

### Native setup required before a device build

`mapbox_maps_flutter` downloads the native SDK from Mapbox's private Maven and
CocoaPods repositories, which need a **secret** token (`sk.…`) distinct from the
public `pk.…` above. Without it `flutter build apk` / `ios` fails with a 401
from api.mapbox.com — the Dart side compiles and the test suite passes either
way, which is why this is documented rather than discovered.

- Android: put `MAPBOX_DOWNLOADS_TOKEN=sk.…` in `~/.gradle/gradle.properties`.
- iOS: put the same token in `~/.netrc` for `machine api.mapbox.com`.

Create both tokens at https://account.mapbox.com/access-tokens/ — the secret one
needs the `DOWNLOADS:READ` scope.

**Unverified on device.** Everything in `test/` runs on the host VM and compiles
Dart only, so the tile layer's behaviour against real tiles — style overrides,
gesture settings, camera events — has not been exercised on hardware here.
