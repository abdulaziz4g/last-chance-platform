import 'package:flutter/foundation.dart';

/// Everything a guest can narrow the map by, as one value.
///
/// Kept apart from MapSearchState because the overlay edits a DRAFT: the guest
/// changes dates, then guests, then a price ceiling, and applies them once.
/// Committing each edit as it happens would fire a search per keystroke and
/// repaint the map under their fingers while they are still deciding.
///
/// Value equality is load-bearing, not decoration — it is what lets the
/// controller skip the round trip when someone opens the sheet, changes their
/// mind, and applies the filters they already had.
@immutable
class MapFilters {
  const MapFilters({
    this.checkInUtc,
    this.checkOutUtc,
    this.guests,
    this.minPriceMinor,
    this.maxPriceMinor,
  });

  static const MapFilters none = MapFilters();

  final DateTime? checkInUtc;
  final DateTime? checkOutUtc;
  final int? guests;

  /// Minor units, matched against the DISCOUNTED price shown on the pin. Null
  /// is unbounded on that side; 0 is a real floor, so every check here is
  /// `!= null` rather than a truthiness test.
  final int? minPriceMinor;
  final int? maxPriceMinor;

  /// Only a complete range counts. The server rejects half a range outright
  /// instead of silently dropping the availability check, so a half-set range
  /// is not a filter — it is a request that would 400.
  bool get hasDateRange => checkInUtc != null && checkOutUtc != null;

  bool get hasPriceRange => minPriceMinor != null || maxPriceMinor != null;

  /// Drives the badge on the filter button. A date range counts once even
  /// though it is two fields, because that is how a guest thinks of it.
  int get activeCount =>
      (hasDateRange ? 1 : 0) +
      (guests != null ? 1 : 0) +
      (hasPriceRange ? 1 : 0);

  bool get isEmpty => activeCount == 0;

  /// An inverted band matches nothing, and the server rejects it. Catching it
  /// here means the guest is told by the sheet they are looking at instead of
  /// by an error banner over the map after a round trip.
  bool get hasInvertedPriceRange =>
      minPriceMinor != null &&
      maxPriceMinor != null &&
      maxPriceMinor! < minPriceMinor!;

  MapFilters copyWith({
    DateTime? checkInUtc,
    DateTime? checkOutUtc,
    int? guests,
    int? minPriceMinor,
    int? maxPriceMinor,
    // Explicit clear flags: copyWith cannot tell "leave it alone" from "set it
    // to null" when the parameter is itself nullable.
    bool clearDates = false,
    bool clearGuests = false,
    bool clearMinPrice = false,
    bool clearMaxPrice = false,
  }) {
    return MapFilters(
      checkInUtc: clearDates ? null : (checkInUtc ?? this.checkInUtc),
      checkOutUtc: clearDates ? null : (checkOutUtc ?? this.checkOutUtc),
      guests: clearGuests ? null : (guests ?? this.guests),
      minPriceMinor:
          clearMinPrice ? null : (minPriceMinor ?? this.minPriceMinor),
      maxPriceMinor:
          clearMaxPrice ? null : (maxPriceMinor ?? this.maxPriceMinor),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is MapFilters &&
      other.checkInUtc == checkInUtc &&
      other.checkOutUtc == checkOutUtc &&
      other.guests == guests &&
      other.minPriceMinor == minPriceMinor &&
      other.maxPriceMinor == maxPriceMinor;

  @override
  int get hashCode => Object.hash(
        checkInUtc,
        checkOutUtc,
        guests,
        minPriceMinor,
        maxPriceMinor,
      );

  @override
  String toString() => 'MapFilters(checkIn: $checkInUtc, checkOut: $checkOutUtc, '
      'guests: $guests, price: $minPriceMinor..$maxPriceMinor)';
}
