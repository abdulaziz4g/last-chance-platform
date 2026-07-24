@Skip(
  'Requires the live dev backend. Run explicitly:\n'
  '  flutter test --run-skipped test/live_api_test.dart\n'
  'with LC_TEST_GUEST_ID / LC_TEST_UNIT_ID set in the environment.',
)
library;

import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/core/api/api_client.dart';
import 'package:lastchance_mobile/core/realtime/realtime_service.dart';
import 'package:lastchance_mobile/features/booking/data/booking_repository.dart';
import 'package:lastchance_mobile/features/booking/domain/booking.dart';
import 'package:lastchance_mobile/features/payment/data/payment_repository.dart';

/// Proves the EXACT data layer the app ships — repositories, entities, error
/// mapping — against the real backend: hold -> initiate -> signed MOCK
/// capture webhook -> watcher observes CONFIRMED. This is the mobile twin of
/// backend/scripts/integration-smoke-payments.ts.
void main() {
  test('mobile data layer drives the booking+payment cycle end to end',
      () async {
    final guestId = Platform.environment['LC_TEST_GUEST_ID'];
    final unitId = Platform.environment['LC_TEST_UNIT_ID'];
    expect(guestId, isNotNull, reason: 'LC_TEST_GUEST_ID must be set');
    expect(unitId, isNotNull, reason: 'LC_TEST_UNIT_ID must be set');

    final dio = buildDio(baseUrl: 'http://localhost:3000');
    final bookings = BookingRepository(dio);
    final payments = PaymentRepository(dio);

    // Unique whole-hour window far from other test data (reruns vary by hour).
    final day = DateTime.now().toUtc().add(const Duration(days: 6));
    final hour = 6 + DateTime.now().millisecondsSinceEpoch ~/ 1000 % 14;
    final checkIn = DateTime.utc(day.year, day.month, day.day, hour);

    final booking = await bookings.placeHold(
      PlaceHoldRequest(
        guestId: guestId!,
        unitId: unitId!,
        type: BookingType.hourly,
        checkInUtc: checkIn,
        checkOutUtc: checkIn.add(const Duration(hours: 2)),
        guestsCount: 1,
      ),
    );

    expect(booking.status, BookingStatus.pendingPayment);
    expect(
      booking.holdRemaining(DateTime.now().toUtc()),
      greaterThan(const Duration(minutes: 9)),
    );
    expect(
      booking.totalAmountMinor,
      booking.baseAmountMinor +
          booking.cleaningFeeMinor +
          booking.serviceFeeMinor +
          booking.taxesMinor -
          booking.discountMinor,
      reason: 'quote must satisfy the DB money constraint',
    );

    final initiated = await payments.initiate(bookingId: booking.id);
    expect(initiated.status, 'REQUIRES_ACTION');
    expect(initiated.providerPaymentId, isNotNull);
    expect(initiated.clientAction, isNotNull);

    // Play the PSP: signed capture webhook over the raw payload bytes.
    final payload = jsonEncode(<String, dynamic>{
      'id': 'evt_mobile_${DateTime.now().millisecondsSinceEpoch}',
      'type': 'payment.captured',
      'data': <String, dynamic>{
        'providerPaymentId': initiated.providerPaymentId,
        'amountMinor': booking.totalAmountMinor,
        'currency': booking.currency,
      },
    });
    final signature = Hmac(sha256, utf8.encode('mock_dev_secret'))
        .convert(utf8.encode(payload))
        .toString();
    final webhook = await dio.post<Map<String, dynamic>>(
      '/webhooks/payments/MOCK',
      data: payload,
      options: Options(
        headers: <String, String>{
          'content-type': 'application/json',
          'x-mock-signature': signature,
        },
      ),
    );
    expect(webhook.data!['received'], isTrue);

    // The watcher — the same stream the payment screen listens to — must
    // observe the webhook-driven confirmation via WS push.
    final realtime = RealtimeService('ws://localhost:3000/ws/availability')
      ..connect();
    addTearDown(realtime.dispose);

    final settled = await BookingWatcher(bookings, realtime)
        .watch(booking.id)
        .firstWhere((b) => b.status != BookingStatus.pendingPayment)
        .timeout(const Duration(seconds: 20));

    expect(settled.status, BookingStatus.confirmed);
  });
}
