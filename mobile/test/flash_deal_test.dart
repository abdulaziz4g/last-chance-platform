import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/features/deals/domain/flash_deal.dart';

Map<String, dynamic> sampleJson() => <String, dynamic>{
      'id': 'fca6fa1e-0000-0000-0000-000000000000',
      'unitId': '11111111-1111-1111-1111-111111111111',
      'propertyId': '22222222-2222-2222-2222-222222222222',
      'propertyName': 'Pay Property',
      'unitName': 'Pay Studio',
      'city': 'Riyadh',
      'title': 'Container demo 40 off',
      'discountPct': 40,
      'status': 'ACTIVE',
      'startsAt': '2026-07-23T10:00:00.000Z',
      'endsAt': '2026-07-23T16:00:00.000Z',
      'quantityTotal': 5,
      'quantityClaimed': 1,
      'quantityRemaining': 4,
      'currency': 'SAR',
      'baseHourlyRateMinor': 8000,
      'baseNightlyRateMinor': 30000,
      'secondsRemaining': 21596,
    };

void main() {
  group('FlashDealStatus', () {
    test('round-trips every wire value', () {
      for (final s in FlashDealStatus.values) {
        expect(FlashDealStatus.fromWire(s.wire), s);
      }
    });
  });

  group('FlashDeal.fromJson', () {
    test('parses the API payload with UTC instants', () {
      final deal = FlashDeal.fromJson(sampleJson());
      expect(deal.status, FlashDealStatus.active);
      expect(deal.discountPct, 40);
      expect(deal.startsAt.isUtc, isTrue);
      expect(deal.quantityRemaining, 4);
      expect(deal.isHourly, isTrue);
    });

    test('computes the net rate from the discount (hourly preferred)', () {
      final deal = FlashDeal.fromJson(sampleJson());
      expect(deal.baseRateMinor, 8000);
      // 8000 * (1 - 0.40) = 4800
      expect(deal.netRateMinor, 4800);
    });

    test('falls back to the nightly rate when there is no hourly rate', () {
      final deal = FlashDeal.fromJson(
        sampleJson()..['baseHourlyRateMinor'] = null,
      );
      expect(deal.isHourly, isFalse);
      expect(deal.baseRateMinor, 30000);
      expect(deal.netRateMinor, 18000); // 30000 * 0.6
    });

    test('remainingSecondsAt clamps at zero after the deal ends', () {
      final deal = FlashDeal.fromJson(sampleJson());
      final before = DateTime.utc(2026, 7, 23, 15); // 1h before end
      final after = DateTime.utc(2026, 7, 23, 17); // past end
      expect(deal.remainingSecondsAt(before), 3600);
      expect(deal.remainingSecondsAt(after), 0);
    });
  });
}
