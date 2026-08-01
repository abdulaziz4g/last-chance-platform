@Skip(
  'Requires the live dev backend and the AlUla seed. Run explicitly:\n'
  '  flutter test --run-skipped test/live_map_test.dart \\\n'
  '    --dart-define=LC_API=http://localhost:3000\n'
  'The dart-define matters: LcConfig defaults to 10.0.2.2, the Android\n'
  'emulator loopback, which is unreachable from a host test run.\n'
  'Seed first: db/dev-seed/alula-listings.sql',
)
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/features/booking/domain/booking.dart';
import 'package:lastchance_mobile/features/map/data/map_repository.dart';
import 'package:lastchance_mobile/features/map/domain/map_pin.dart';

/// Proves the EXACT data layer the app ships parses the real viewport
/// endpoint. Fixture tests only prove the model matches what I believed the
/// contract was; this proves it matches what the server actually sends.
///
/// The mobile twin of the map assertions in
/// backend/scripts/integration-smoke-moderation.ts.
void main() {
  test('map repository parses the live viewport endpoint', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final repo = container.read(mapRepositoryProvider);

    // The AlUla valley — seeded by db/dev-seed/alula-listings.sql.
    const alula = MapBounds(
      minLng: 37.85,
      minLat: 26.55,
      maxLng: 38.08,
      maxLat: 26.83,
    );

    final result = await repo.search(
      const MapSearchQuery(bounds: alula, bookingType: BookingType.nightly),
    );

    expect(result.pins, isNotEmpty,
        reason: 'run db/dev-seed/alula-listings.sql first');

    for (final pin in result.pins) {
      // Coordinates must be inside the requested box and must be the
      // displaced ones — the API is not permitted to hand out a true position.
      expect(alula.contains(pin.approxLng, pin.approxLat), isTrue);
      expect(pin.privacyRadiusMetres, greaterThan(0));
      expect(pin.currency, hasLength(3));
      expect(pin.priceMinor, greaterThan(0));
      // The pin price is the discounted one, so it can never exceed the base.
      expect(pin.priceMinor, lessThanOrEqualTo(pin.basePriceMinor));
    }

    // The seed carries one live flash deal, and its price must actually be
    // discounted — a deal badge over an undiscounted price reads as dishonest.
    final discounted = result.pins.where((p) => p.hasDeal).toList();
    expect(discounted, isNotEmpty, reason: 'seed includes an ACTIVE deal');
    for (final pin in discounted) {
      expect(pin.deal!.discountPct, greaterThan(0));
      expect(pin.priceMinor, lessThan(pin.basePriceMinor));
    }

    // Clustering must reflect reality: units of one property share a point.
    final clusters = MapPinCluster.from(result.pins);
    expect(clusters.length, lessThanOrEqualTo(result.pins.length));
    for (final cluster in clusters) {
      expect(cluster.fromPriceMinor,
          equals(cluster.pins.map((p) => p.priceMinor).reduce(
                (a, b) => a < b ? a : b,
              )));
    }
  });

  test('an oversized viewport is refused by the server', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final repo = container.read(mapRepositoryProvider);

    await expectLater(
      repo.search(
        const MapSearchQuery(
          bounds: MapBounds(
            minLng: -180,
            minLat: -85,
            maxLng: 180,
            maxLat: 85,
          ),
          bookingType: BookingType.nightly,
        ),
      ),
      throwsA(isA<Object>()),
    );
  });
}
