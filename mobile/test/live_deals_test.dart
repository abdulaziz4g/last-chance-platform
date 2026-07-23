@Skip(
  'Requires the live dev backend. Run explicitly:\n'
  '  flutter test --run-skipped test/live_deals_test.dart\n'
  'with LC_TEST_GUEST_ID / LC_TEST_UNIT_ID set in the environment.',
)
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/core/api/api_client.dart';
import 'package:lastchance_mobile/features/booking/domain/booking.dart';
import 'package:lastchance_mobile/features/deals/data/deal_repository.dart';
import 'package:lastchance_mobile/features/deals/domain/flash_deal.dart';

/// Proves the mobile flash-deal path end to end against the real backend:
/// create an ACTIVE deal (admin) -> the guest DealRepository lists it and
/// claims it -> the returned booking is discounted and carries the deal id.
void main() {
  test('mobile claims a flash deal into a discounted hold', () async {
    final guestId = Platform.environment['LC_TEST_GUEST_ID'];
    final unitId = Platform.environment['LC_TEST_UNIT_ID'];
    expect(guestId, isNotNull, reason: 'LC_TEST_GUEST_ID must be set');
    expect(unitId, isNotNull, reason: 'LC_TEST_UNIT_ID must be set');

    final dio = buildDio(baseUrl: 'http://localhost:3000');
    final deals = DealRepository(dio);

    // Reuse an existing ACTIVE deal on the unit if there is one; otherwise
    // create one. (A unit may hold only one active deal at a time — the
    // deals_no_overlap_per_unit exclusion constraint — so we must not blindly
    // create a second overlapping deal.)
    FlashDeal? mine;
    for (final d in await deals.getActiveDeals()) {
      if (d.unitId == unitId && d.quantityRemaining > 0) {
        mine = d;
        break;
      }
    }
    if (mine == null) {
      final now = DateTime.now().toUtc();
      await dio.post<Map<String, dynamic>>(
        '/deals',
        data: <String, dynamic>{
          'unitId': unitId,
          'title': 'Mobile live test',
          'discountPct': 35,
          'startsAt': now.subtract(const Duration(minutes: 1)).toIso8601String(),
          'endsAt': now.add(const Duration(hours: 3)).toIso8601String(),
          'quantityTotal': 3,
        },
        options: Options(headers: <String, String>{'x-actor-type': 'ADMIN'}),
      );
      for (final d in await deals.getActiveDeals()) {
        if (d.unitId == unitId) {
          mine = d;
          break;
        }
      }
    }
    expect(mine, isNotNull, reason: 'an active deal on the unit is available');
    expect(mine!.status, FlashDealStatus.active);

    // Claim it for a far-out, unlikely-to-conflict window (offset by seconds
    // so repeat runs pick distinct windows).
    final offsetDays = 30 + DateTime.now().millisecondsSinceEpoch ~/ 1000 % 60;
    final day = DateTime.now().toUtc().add(Duration(days: offsetDays));
    final checkIn = DateTime.utc(day.year, day.month, day.day, 20);
    final booking = await deals.claim(
      mine.id,
      ClaimDealRequest(
        guestId: guestId!,
        bookingType: BookingType.hourly,
        checkInUtc: checkIn,
        checkOutUtc: checkIn.add(const Duration(hours: 2)),
        guestsCount: 1,
      ),
    );

    expect(booking.status, BookingStatus.pendingPayment);
    expect(booking.flashDealId, mine.id);
    expect(booking.discountMinor, greaterThan(0));
    // Discount is exactly the deal's percentage off the base.
    expect(
      booking.discountMinor,
      (booking.baseAmountMinor * mine.discountPct / 100).round(),
    );
    // The quote still satisfies the DB money constraint.
    expect(
      booking.totalAmountMinor,
      booking.baseAmountMinor +
          booking.cleaningFeeMinor +
          booking.serviceFeeMinor +
          booking.taxesMinor -
          booking.discountMinor,
    );
  });
}
