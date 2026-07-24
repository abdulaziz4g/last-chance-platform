import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config.dart';
import '../application/hold_flow_controller.dart';
import '../domain/booking.dart';
import 'hold_flow_views.dart';

/// The guest hold → pay → confirmed journey for a plain booking. The
/// flash-deal claim flow (DealClaimScreen) reuses the same shared views.
class BookingFlowScreen extends ConsumerWidget {
  const BookingFlowScreen({super.key});

  PlaceHoldRequest _demoRequest() {
    final tomorrow = DateTime.now().toUtc().add(const Duration(days: 1));
    final checkIn = DateTime.utc(tomorrow.year, tomorrow.month, tomorrow.day, 9);
    return PlaceHoldRequest(
      guestId: LcConfig.demoGuestId,
      unitId: LcConfig.demoUnitId,
      type: BookingType.hourly,
      checkInUtc: checkIn,
      checkOutUtc: checkIn.add(const Duration(hours: 3)),
      guestsCount: 2,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(holdFlowProvider);
    final controller = ref.read(holdFlowProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Book your stay')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: switch (state) {
          HoldIdle() => _Idle(onHold: () {
              if (!LcConfig.demoIdsConfigured) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Set --dart-define=LC_GUEST_ID / LC_UNIT_ID to demo',
                    ),
                  ),
                );
                return;
              }
              controller.placeHold(_demoRequest());
            }),
          HoldPlacing() => const Center(child: CircularProgressIndicator()),
          HoldActive(:final booking, :final paymentInitiated) => HoldActiveView(
              booking: booking,
              paymentInitiated: paymentInitiated,
              onPay: controller.startPayment,
              onExpired: controller.onCountdownExpired,
            ),
          HoldConfirmed(:final booking) => HoldConfirmedView(
              booking: booking,
              onDone: controller.reset,
            ),
          HoldExpired() => HoldNoticeView(
              icon: Icons.hourglass_disabled,
              color: Colors.redAccent,
              title: 'Hold expired',
              body: 'The 10-minute window lapsed and the unit was released. '
                  'You can try booking again.',
              actionLabel: 'Start over',
              onAction: controller.reset,
            ),
          HoldFailed(:final code, :final message) => HoldNoticeView(
              icon: Icons.error_outline,
              color: Colors.redAccent,
              title: code == 'UNIT_UNAVAILABLE'
                  ? 'Someone was faster'
                  : 'Something went wrong',
              body: message,
              actionLabel: 'Try again',
              onAction: controller.reset,
            ),
        },
      ),
    );
  }
}

class _Idle extends StatelessWidget {
  const _Idle({required this.onHold});

  final VoidCallback onHold;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'HOURLY STAY',
                  style: TextStyle(
                    fontSize: 11,
                    letterSpacing: 3,
                    color: Colors.white.withValues(alpha: 0.5),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Tomorrow · 09:00 – 12:00 UTC',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  '2 guests · instant booking · free cancellation until check-in',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.white.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
          ),
        ),
        const Spacer(),
        FilledButton(
          onPressed: onHold,
          child: const Text('Hold for 10 minutes'),
        ),
        const SizedBox(height: 8),
        Text(
          'No charge until you complete payment.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: Colors.white.withValues(alpha: 0.45),
          ),
        ),
      ],
    );
  }
}
