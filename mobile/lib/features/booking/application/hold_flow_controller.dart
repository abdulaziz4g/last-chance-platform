import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../deals/data/deal_repository.dart';
import '../../payment/data/payment_repository.dart';
import '../data/booking_repository.dart';
import '../domain/booking.dart';

/// The guest-side hold state machine — the mobile mirror of the backend FSM,
/// reduced to what the payment screen needs to render.
sealed class HoldFlowState {
  const HoldFlowState();
}

class HoldIdle extends HoldFlowState {
  const HoldIdle();
}

class HoldPlacing extends HoldFlowState {
  const HoldPlacing();
}

/// Hold placed; countdown running; payment not yet completed.
class HoldActive extends HoldFlowState {
  const HoldActive(this.booking, {this.paymentInitiated = false});
  final Booking booking;
  final bool paymentInitiated;
}

class HoldConfirmed extends HoldFlowState {
  const HoldConfirmed(this.booking);
  final Booking booking;
}

class HoldExpired extends HoldFlowState {
  const HoldExpired(this.booking);
  final Booking booking;
}

class HoldFailed extends HoldFlowState {
  const HoldFailed(this.code, this.message);
  final String code;
  final String message;
}

class HoldFlowController extends AutoDisposeNotifier<HoldFlowState> {
  StreamSubscription<Booking>? _watchSub;

  @override
  HoldFlowState build() {
    ref.onDispose(_stopWatching);
    return const HoldIdle();
  }

  BookingRepository get _bookings => ref.read(bookingRepositoryProvider);
  PaymentRepository get _payments => ref.read(paymentRepositoryProvider);
  DealRepository get _deals => ref.read(dealRepositoryProvider);
  BookingWatcher get _watcher => ref.read(bookingWatcherProvider);

  /// Step 1 — place the 10-minute hold. A 409 UNIT_UNAVAILABLE here means a
  /// faster guest won the exclusion-constraint race: surface it immediately.
  Future<void> placeHold(PlaceHoldRequest request) async {
    state = const HoldPlacing();
    try {
      final booking = await _bookings.placeHold(request);
      state = HoldActive(booking);
      _startWatching(booking.id);
    } on ApiException catch (e) {
      state = HoldFailed(e.code, e.message);
    }
  }

  /// Claim a flash deal — the backend atomically decrements inventory and
  /// returns a DISCOUNTED PENDING_PAYMENT booking, so from here the hold +
  /// payment flow is identical to a normal booking. SOLD_OUT and
  /// UNIT_UNAVAILABLE surface as distinct, honest failures.
  Future<void> claimDeal(String dealId, ClaimDealRequest request) async {
    state = const HoldPlacing();
    try {
      final booking = await _deals.claim(dealId, request);
      state = HoldActive(booking);
      _startWatching(booking.id);
    } on ApiException catch (e) {
      state = HoldFailed(e.code, e.message);
    }
  }

  /// Step 2 — initiate payment. The provider client action would hand off to
  /// the PSP SDK here; confirmation arrives via the backend webhook, observed
  /// by the watcher started in step 1.
  Future<void> startPayment() async {
    final current = state;
    if (current is! HoldActive) return;
    try {
      await _payments.initiate(bookingId: current.booking.id);
      state = HoldActive(current.booking, paymentInitiated: true);
    } on ApiException catch (e) {
      if (e.isHoldExpired) {
        state = HoldExpired(current.booking);
      } else {
        state = HoldFailed(e.code, e.message);
      }
    }
  }

  /// Dev-build shortcut standing in for the PSP SDK completion (see
  /// [BookingRepository.confirmDev]).
  Future<void> completePaymentDev() async {
    final current = state;
    if (current is! HoldActive) return;
    try {
      final booking = await _bookings.confirmDev(current.booking.id);
      _stopWatching();
      state = HoldConfirmed(booking);
    } on ApiException catch (e) {
      if (e.isHoldExpired) {
        state = HoldExpired(current.booking);
      } else {
        state = HoldFailed(e.code, e.message);
      }
    }
  }

  /// Countdown hit zero locally; the backend sweeper is authoritative, but
  /// the UI flips immediately for honest UX.
  void onCountdownExpired() {
    final current = state;
    if (current is HoldActive) {
      _stopWatching();
      state = HoldExpired(current.booking);
    }
  }

  void reset() {
    _stopWatching();
    state = const HoldIdle();
  }

  void _startWatching(String bookingId) {
    _stopWatching();
    _watchSub = _watcher.watch(bookingId).listen(
      (booking) {
        switch (booking.status) {
          case BookingStatus.confirmed:
            state = HoldConfirmed(booking);
            _stopWatching();
          case BookingStatus.expired:
            state = HoldExpired(booking);
            _stopWatching();
          case BookingStatus.pendingPayment:
            break; // still counting down
          default:
            break;
        }
      },
      onError: (Object _) {
        // Polling hiccups are non-fatal; the countdown and retry cover it.
      },
    );
  }

  void _stopWatching() {
    unawaited(_watchSub?.cancel());
    _watchSub = null;
  }
}

final holdFlowProvider =
    NotifierProvider.autoDispose<HoldFlowController, HoldFlowState>(
  HoldFlowController.new,
);
