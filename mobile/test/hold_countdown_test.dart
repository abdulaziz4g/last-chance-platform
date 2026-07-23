import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/features/booking/presentation/hold_countdown.dart';

void main() {
  testWidgets('counts down with an injected clock and fires onExpired once',
      (tester) async {
    var now = DateTime.utc(2026, 1, 1, 12);
    final expiresAt = now.add(const Duration(minutes: 10));
    var expiredCalls = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HoldCountdown(
            expiresAt: expiresAt,
            clock: () => now,
            onExpired: () => expiredCalls++,
          ),
        ),
      ),
    );

    expect(find.text('10:00'), findsOneWidget);
    expect(find.text('RESERVED FOR YOU'), findsOneWidget);

    // Jump inside the final minute — urgency copy appears.
    now = now.add(const Duration(minutes: 9, seconds: 30));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('00:30'), findsOneWidget);
    expect(find.text('Complete payment now'), findsOneWidget);

    // Cross zero — expiry fires exactly once and the display clamps.
    now = now.add(const Duration(seconds: 31));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('00:00'), findsOneWidget);
    expect(expiredCalls, 1);

    await tester.pump(const Duration(seconds: 5));
    expect(expiredCalls, 1, reason: 'onExpired must not re-fire');
  });
}
