import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/features/booking/domain/booking.dart';

Map<String, dynamic> sampleJson() => <String, dynamic>{
      'id': '5fb3f50f-092d-4f49-921f-9bd9edecc11c',
      'bookingCode': 'LC-260801-9F3A21BC',
      'guestId': '00000000-0000-0000-0000-00000000aa01',
      'unitId': '00000000-0000-0000-0000-00000000cc01',
      'propertyId': '00000000-0000-0000-0000-00000000bb01',
      'bookingType': 'HOURLY',
      'status': 'PENDING_PAYMENT',
      'checkInUtc': '2026-08-01T10:00:00.000Z',
      'checkOutUtc': '2026-08-01T14:00:00.000Z',
      'guestsCount': 2,
      'holdExpiresAt': '2026-08-01T09:10:00.000Z',
      'currency': 'SAR',
      'baseAmountMinor': 32000,
      'cleaningFeeMinor': 0,
      'serviceFeeMinor': 960,
      'taxesMinor': 4944,
      'discountMinor': 0,
      'totalAmountMinor': 37904,
    };

void main() {
  group('BookingStatus', () {
    test('round-trips every wire value', () {
      for (final status in BookingStatus.values) {
        expect(BookingStatus.fromWire(status.wire), status);
      }
    });

    test('inventory-holding set matches the DB exclusion predicate', () {
      final holding = BookingStatus.values.where((s) => s.holdsInventory);
      expect(holding, <BookingStatus>[
        BookingStatus.pendingPayment,
        BookingStatus.confirmed,
        BookingStatus.checkedIn,
      ]);
    });
  });

  group('Booking.fromJson', () {
    test('parses the API payload with UTC instants and integer money', () {
      final booking = Booking.fromJson(sampleJson());

      expect(booking.status, BookingStatus.pendingPayment);
      expect(booking.type, BookingType.hourly);
      expect(booking.checkInUtc.isUtc, isTrue);
      expect(booking.stayDuration, const Duration(hours: 4));
      expect(booking.totalAmountMinor, 37904);
      // The Phase-1 CHECK constraint, mirrored client-side:
      expect(
        booking.totalAmountMinor,
        booking.baseAmountMinor +
            booking.cleaningFeeMinor +
            booking.serviceFeeMinor +
            booking.taxesMinor -
            booking.discountMinor,
      );
    });

    test('holdRemaining clamps at zero and honors status', () {
      final booking = Booking.fromJson(sampleJson());
      final before = DateTime.utc(2026, 8, 1, 9, 5);
      final after = DateTime.utc(2026, 8, 1, 9, 15);

      expect(booking.holdRemaining(before), const Duration(minutes: 5));
      expect(booking.holdRemaining(after), Duration.zero);

      final confirmed = Booking.fromJson(
        sampleJson()..['status'] = 'CONFIRMED',
      );
      expect(confirmed.holdRemaining(before), Duration.zero);
    });
  });

  test('PlaceHoldRequest serializes to the API contract', () {
    final request = PlaceHoldRequest(
      guestId: 'g',
      unitId: 'u',
      type: BookingType.hourly,
      checkInUtc: DateTime.utc(2026, 8, 1, 10),
      checkOutUtc: DateTime.utc(2026, 8, 1, 14),
      guestsCount: 2,
    );
    final json = request.toJson();
    expect(json['bookingType'], 'HOURLY');
    expect(json['checkInUtc'], '2026-08-01T10:00:00.000Z');
    expect(json['source'], 'ANDROID');
  });
}
