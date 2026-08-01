import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/features/map/domain/map_filters.dart';

void main() {
  group('activeCount', () {
    test('nothing set is no filters', () {
      expect(MapFilters.none.activeCount, 0);
      expect(MapFilters.none.isEmpty, isTrue);
    });

    test('a date range counts once, not twice', () {
      // Two fields, one idea. A guest who picked "3–5 Aug" set one filter and
      // a badge reading 2 would be describing the implementation.
      final filters = MapFilters(
        checkInUtc: DateTime.utc(2026, 8, 3),
        checkOutUtc: DateTime.utc(2026, 8, 5),
      );
      expect(filters.activeCount, 1);
    });

    test('half a date range is not a filter at all', () {
      // The server rejects half a range outright, so it can never be sent —
      // counting it would show a badge for something that is not applied.
      final filters = MapFilters(checkInUtc: DateTime.utc(2026, 8, 3));
      expect(filters.hasDateRange, isFalse);
      expect(filters.activeCount, 0);
    });

    test('either price bound alone counts, and both together count once', () {
      expect(const MapFilters(minPriceMinor: 10000).activeCount, 1);
      expect(const MapFilters(maxPriceMinor: 90000).activeCount, 1);
      expect(
        const MapFilters(minPriceMinor: 10000, maxPriceMinor: 90000)
            .activeCount,
        1,
      );
    });

    test('a zero floor is a real filter, not an absent one', () {
      // The falsy-check bug: 0 is a bound the guest set deliberately.
      const filters = MapFilters(minPriceMinor: 0);
      expect(filters.hasPriceRange, isTrue);
      expect(filters.activeCount, 1);
    });

    test('counts each kind separately', () {
      final filters = MapFilters(
        checkInUtc: DateTime.utc(2026, 8, 3),
        checkOutUtc: DateTime.utc(2026, 8, 5),
        guests: 2,
        maxPriceMinor: 90000,
      );
      expect(filters.activeCount, 3);
    });
  });

  group('inverted price range', () {
    test('is detected so the sheet can say so before a round trip', () {
      const filters = MapFilters(minPriceMinor: 90000, maxPriceMinor: 10000);
      expect(filters.hasInvertedPriceRange, isTrue);
    });

    test('an equal min and max is a valid band, not inverted', () {
      const filters = MapFilters(minPriceMinor: 50000, maxPriceMinor: 50000);
      expect(filters.hasInvertedPriceRange, isFalse);
    });

    test('one bound alone can never be inverted', () {
      expect(
        const MapFilters(minPriceMinor: 90000).hasInvertedPriceRange,
        isFalse,
      );
      expect(
        const MapFilters(maxPriceMinor: 10000).hasInvertedPriceRange,
        isFalse,
      );
    });
  });

  group('copyWith', () {
    test('clear flags distinguish "leave it" from "set it to null"', () {
      final filters = MapFilters(
        checkInUtc: DateTime.utc(2026, 8, 3),
        checkOutUtc: DateTime.utc(2026, 8, 5),
        guests: 2,
        minPriceMinor: 10000,
        maxPriceMinor: 90000,
      );

      // Passing nothing keeps everything — the case a plain nullable parameter
      // gets wrong.
      expect(filters.copyWith(), filters);

      expect(filters.copyWith(clearDates: true).hasDateRange, isFalse);
      expect(filters.copyWith(clearGuests: true).guests, isNull);
      expect(filters.copyWith(clearMinPrice: true).minPriceMinor, isNull);
      expect(filters.copyWith(clearMaxPrice: true).maxPriceMinor, isNull);
    });

    test('clearing one price bound leaves the other standing', () {
      const filters = MapFilters(minPriceMinor: 10000, maxPriceMinor: 90000);
      final cleared = filters.copyWith(clearMinPrice: true);
      expect(cleared.minPriceMinor, isNull);
      expect(cleared.maxPriceMinor, 90000);
    });
  });

  group('equality', () {
    test('two filters with the same values are equal', () {
      // This is what lets the controller skip a search when the guest opens
      // the sheet and applies what was already there.
      final a = MapFilters(
        checkInUtc: DateTime.utc(2026, 8, 3),
        checkOutUtc: DateTime.utc(2026, 8, 5),
        guests: 2,
      );
      final b = MapFilters(
        checkInUtc: DateTime.utc(2026, 8, 3),
        checkOutUtc: DateTime.utc(2026, 8, 5),
        guests: 2,
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });

    test('a differing bound makes them unequal', () {
      expect(
        const MapFilters(maxPriceMinor: 90000),
        isNot(const MapFilters(maxPriceMinor: 90001)),
      );
    });

    test('null and zero are not the same filter', () {
      expect(const MapFilters(minPriceMinor: 0), isNot(MapFilters.none));
    });
  });
}
