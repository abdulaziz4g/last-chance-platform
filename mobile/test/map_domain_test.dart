import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/features/booking/domain/booking.dart';
import 'package:lastchance_mobile/features/map/domain/map_pin.dart';

Map<String, dynamic> pinJson({
  String unitId = '11111111-1111-1111-1111-111111111111',
  double lng = 37.9231,
  double lat = 26.6089,
  int basePrice = 118000,
  int price = 88500,
  Map<String, dynamic>? deal,
}) =>
    <String, dynamic>{
      'unitId': unitId,
      'propertyId': '22222222-2222-2222-2222-222222222222',
      'unitName': 'Stargazer Tent',
      'propertyName': 'Hegra Desert Camp',
      'propertySlug': 'hegra-desert-camp',
      'propertyType': 'CAMP',
      'unitType': 'STUDIO',
      'city': 'AlUla',
      'district': 'Hegra',
      'maxGuests': 3,
      'currency': 'SAR',
      'ratingAvg': 4.82,
      'ratingCount': 44,
      'photos': <dynamic>['/media/units/a/1.png', 42, '/media/units/a/2.png'],
      'approxLat': lat,
      'approxLng': lng,
      'privacyRadiusMetres': 500,
      'basePriceMinor': basePrice,
      'priceMinor': price,
      'bookingType': 'NIGHTLY',
      'deal': deal,
    };

void main() {
  group('MapPin', () {
    test('parses the wire contract', () {
      final pin = MapPin.fromJson(pinJson(deal: <String, dynamic>{
        'dealId': '33333333-3333-3333-3333-333333333333',
        'discountPct': 25,
        'endsAt': '2026-08-02T18:00:00.000Z',
      }));

      expect(pin.unitName, 'Stargazer Tent');
      expect(pin.bookingType, BookingType.nightly);
      expect(pin.privacyRadiusMetres, 500);
      expect(pin.hasDeal, isTrue);
      expect(pin.deal!.discountPct, 25);
      expect(pin.deal!.endsAt!.isUtc, isTrue);
    });

    test('drops non-string entries from photos rather than crashing', () {
      final pin = MapPin.fromJson(pinJson());
      expect(pin.photos, <String>['/media/units/a/1.png', '/media/units/a/2.png']);
    });

    test('district and rating are allowed to be absent', () {
      final json = pinJson()
        ..['district'] = null
        ..['ratingAvg'] = null;
      final pin = MapPin.fromJson(json);
      expect(pin.district, isNull);
      expect(pin.ratingAvg, isNull);
    });

    test('showsDiscount is false when the discounted price rounds to the base',
        () {
      // A struck-through price identical to the one beside it reads as a bug.
      final pin = MapPin.fromJson(pinJson(basePrice: 10000, price: 10000));
      expect(pin.showsDiscount, isFalse);
    });

    test('deal countdown never goes negative', () {
      final pin = MapPin.fromJson(pinJson(deal: <String, dynamic>{
        'dealId': 'd',
        'discountPct': 10,
        'endsAt': '2026-08-01T00:00:00.000Z',
      }));
      final after = DateTime.utc(2026, 8, 1, 1);
      expect(pin.deal!.remainingSecondsAt(after), 0);
    });
  });

  group('MapBounds', () {
    const alula = MapBounds(
      minLng: 37.85,
      minLat: 26.55,
      maxLng: 38.08,
      maxLat: 26.83,
    );

    test('rejects an inverted or oversized box', () {
      expect(alula.isSearchable, isTrue);
      const inverted =
          MapBounds(minLng: 38, minLat: 27, maxLng: 37, maxLat: 26);
      expect(inverted.isSearchable, isFalse);
      const huge =
          MapBounds(minLng: -180, minLat: -80, maxLng: 180, maxLat: 80);
      expect(huge.isSearchable, isFalse);
    });

    test('inflating grows about the centre', () {
      final wide = alula.inflated(2);
      expect(wide.spanLng, closeTo(alula.spanLng * 2, 1e-9));
      // Centre must not drift, or the prefetch box would be lopsided.
      expect(
        (wide.minLng + wide.maxLng) / 2,
        closeTo((alula.minLng + alula.maxLng) / 2, 1e-9),
      );
    });

    test('containsBounds decides whether a pan needs a refetch', () {
      final prefetched = alula.inflated(1.4);
      expect(prefetched.containsBounds(alula), isTrue);

      const pannedFar = MapBounds(
        minLng: 39.0,
        minLat: 26.55,
        maxLng: 39.2,
        maxLat: 26.83,
      );
      expect(prefetched.containsBounds(pannedFar), isFalse);
    });
  });

  group('MapPinCluster', () {
    test('groups units that share a property coordinate', () {
      // The approximate location is per property, so two units in one building
      // land on the same point and must not become two stacked markers.
      final pins = <MapPin>[
        MapPin.fromJson(pinJson(unitId: 'a', price: 145000)),
        MapPin.fromJson(pinJson(unitId: 'b', price: 92000)),
        MapPin.fromJson(
          pinJson(unitId: 'c', lng: 38.0261, lat: 26.6534, price: 260000),
        ),
      ];

      final clusters = MapPinCluster.from(pins);
      expect(clusters.length, 2);

      final shared = clusters.firstWhere((c) => c.isMultiple);
      expect(shared.pins.length, 2);
      // The marker shows the cheapest — a "from" price.
      expect(shared.fromPriceMinor, 92000);
    });

    test('reports the best discount in the cluster', () {
      final pins = <MapPin>[
        MapPin.fromJson(pinJson(unitId: 'a')),
        MapPin.fromJson(pinJson(
          unitId: 'b',
          deal: <String, dynamic>{
            'dealId': 'd1',
            'discountPct': 15,
            'endsAt': null,
          },
        )),
        MapPin.fromJson(pinJson(
          unitId: 'c',
          deal: <String, dynamic>{
            'dealId': 'd2',
            'discountPct': 30,
            'endsAt': null,
          },
        )),
      ];

      final cluster = MapPinCluster.from(pins).single;
      expect(cluster.hasDeal, isTrue);
      expect(cluster.bestDiscountPct, 30);
    });

    test('a cluster with no deals reports none', () {
      final cluster = MapPinCluster.from(
        <MapPin>[MapPin.fromJson(pinJson())],
      ).single;
      expect(cluster.hasDeal, isFalse);
      expect(cluster.bestDiscountPct, isNull);
    });
  });
}
