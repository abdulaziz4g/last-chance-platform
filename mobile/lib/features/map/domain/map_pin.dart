import 'dart:math' as math;

import '../../booking/domain/booking.dart';

/// Map domain — a 1:1 typed mirror of GET /units/map-search.
///
/// Every coordinate reaching this layer is the APPROXIMATE one. The API never
/// returns a property's true position before a booking is confirmed, so there
/// is deliberately no field here that could hold one: a model with nowhere to
/// put an exact coordinate cannot leak one by accident.

/// A geographic bounding box in WGS84 degrees.
class MapBounds {
  const MapBounds({
    required this.minLng,
    required this.minLat,
    required this.maxLng,
    required this.maxLat,
  });

  final double minLng;
  final double minLat;
  final double maxLng;
  final double maxLat;

  /// The server caps a viewport at 5° per axis; mirrored so the client can
  /// avoid firing a request that is certain to come back 400.
  static const double maxSpanDegrees = 5;

  double get spanLng => maxLng - minLng;
  double get spanLat => maxLat - minLat;

  bool get isSearchable =>
      spanLng > 0 &&
      spanLat > 0 &&
      spanLng <= maxSpanDegrees &&
      spanLat <= maxSpanDegrees;

  /// Grows the box by [factor] about its centre. Used to prefetch a margin
  /// around the visible area so a short drag does not always mean a round-trip.
  MapBounds inflated(double factor) {
    final cx = (minLng + maxLng) / 2;
    final cy = (minLat + maxLat) / 2;
    final halfX = spanLng * factor / 2;
    final halfY = spanLat * factor / 2;
    return MapBounds(
      minLng: cx - halfX,
      minLat: cy - halfY,
      maxLng: cx + halfX,
      maxLat: cy + halfY,
    );
  }

  bool contains(double lng, double lat) =>
      lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;

  /// True when [other] lies entirely inside this box — the test for "the user
  /// panned within what we already fetched, so do not refetch".
  bool containsBounds(MapBounds other) =>
      other.minLng >= minLng &&
      other.maxLng <= maxLng &&
      other.minLat >= minLat &&
      other.maxLat <= maxLat;

  @override
  bool operator ==(Object other) =>
      other is MapBounds &&
      other.minLng == minLng &&
      other.minLat == minLat &&
      other.maxLng == maxLng &&
      other.maxLat == maxLat;

  @override
  int get hashCode => Object.hash(minLng, minLat, maxLng, maxLat);

  @override
  String toString() =>
      'MapBounds($minLng,$minLat → $maxLng,$maxLat)';
}

/// The live flash deal attached to a pin, if any.
class MapPinDeal {
  const MapPinDeal({
    required this.dealId,
    required this.discountPct,
    required this.endsAt,
  });

  factory MapPinDeal.fromJson(Map<String, dynamic> json) => MapPinDeal(
        dealId: json['dealId'] as String,
        discountPct: (json['discountPct'] as num).toDouble(),
        endsAt: json['endsAt'] == null
            ? null
            : DateTime.parse(json['endsAt'] as String).toUtc(),
      );

  final String dealId;
  final double discountPct;
  final DateTime? endsAt;

  /// Seconds left on the countdown, computed against [now]. Never negative.
  int remainingSecondsAt(DateTime now) {
    final ends = endsAt;
    if (ends == null) return 0;
    final left = ends.difference(now).inSeconds;
    return left < 0 ? 0 : left;
  }
}

class MapPin {
  const MapPin({
    required this.unitId,
    required this.propertyId,
    required this.unitName,
    required this.propertyName,
    required this.propertySlug,
    required this.propertyType,
    required this.unitType,
    required this.city,
    required this.district,
    required this.maxGuests,
    required this.currency,
    required this.ratingAvg,
    required this.ratingCount,
    required this.photos,
    required this.approxLat,
    required this.approxLng,
    required this.privacyRadiusMetres,
    required this.basePriceMinor,
    required this.priceMinor,
    required this.bookingType,
    required this.deal,
  });

  factory MapPin.fromJson(Map<String, dynamic> json) => MapPin(
        unitId: json['unitId'] as String,
        propertyId: json['propertyId'] as String,
        unitName: json['unitName'] as String,
        propertyName: json['propertyName'] as String,
        propertySlug: json['propertySlug'] as String,
        propertyType: json['propertyType'] as String,
        unitType: json['unitType'] as String,
        city: json['city'] as String,
        district: json['district'] as String?,
        maxGuests: (json['maxGuests'] as num).toInt(),
        currency: json['currency'] as String,
        ratingAvg: (json['ratingAvg'] as num?)?.toDouble(),
        ratingCount: (json['ratingCount'] as num).toInt(),
        photos: ((json['photos'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<String>()
            .toList(growable: false),
        approxLat: (json['approxLat'] as num).toDouble(),
        approxLng: (json['approxLng'] as num).toDouble(),
        privacyRadiusMetres: (json['privacyRadiusMetres'] as num).toInt(),
        basePriceMinor: (json['basePriceMinor'] as num).toInt(),
        priceMinor: (json['priceMinor'] as num).toInt(),
        bookingType: BookingType.fromWire(json['bookingType'] as String),
        deal: json['deal'] == null
            ? null
            : MapPinDeal.fromJson(json['deal'] as Map<String, dynamic>),
      );

  final String unitId;
  final String propertyId;
  final String unitName;
  final String propertyName;
  final String propertySlug;
  final String propertyType;
  final String unitType;
  final String city;
  final String? district;
  final int maxGuests;
  final String currency;
  final double? ratingAvg;
  final int ratingCount;
  final List<String> photos;

  /// Displaced 250–500 m from the true position. Never the real address.
  final double approxLat;
  final double approxLng;

  /// The radius the UI must draw. Published by the API so the client cannot
  /// imply more precision than the displacement actually provides.
  final int privacyRadiusMetres;

  /// Undiscounted rate, for struck-through display.
  final int basePriceMinor;

  /// What the guest would actually pay — any discount already applied.
  final int priceMinor;

  final BookingType bookingType;
  final MapPinDeal? deal;

  bool get hasDeal => deal != null;

  /// Only true when the price on the pin really is lower than the base. A deal
  /// rounding to the same figure must not render a struck-through price
  /// identical to the one beside it.
  bool get showsDiscount => priceMinor < basePriceMinor;
}

/// One page of viewport results.
class MapSearchResult {
  const MapSearchResult({required this.pins, required this.truncated});

  factory MapSearchResult.fromJson(Map<String, dynamic> json) =>
      MapSearchResult(
        pins: ((json['pins'] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => MapPin.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
        truncated: json['truncated'] as bool? ?? false,
      );

  final List<MapPin> pins;

  /// The viewport held more than the server would return. Surfaced so the UI
  /// can say "zoom in to see everything" rather than silently showing a subset.
  final bool truncated;
}

/// Groups pins that share a coordinate.
///
/// The approximate location is per PROPERTY, so every unit in one building
/// projects to the same point. Rendering them as separate markers stacks them
/// pixel-perfect and leaves all but the topmost untappable — which matters
/// more on a touch screen than on a desktop. Callers render one marker per
/// cluster showing the "from" price, and expand on tap.
class MapPinCluster {
  const MapPinCluster({required this.pins});

  final List<MapPin> pins;

  MapPin get representative => pins.reduce(
        (a, b) => a.priceMinor <= b.priceMinor ? a : b,
      );

  double get lat => pins.first.approxLat;
  double get lng => pins.first.approxLng;
  int get fromPriceMinor => representative.priceMinor;
  String get currency => representative.currency;
  bool get hasDeal => pins.any((p) => p.hasDeal);
  bool get isMultiple => pins.length > 1;

  /// The largest discount in the cluster, which is what a badge should show.
  double? get bestDiscountPct {
    final discounts = pins
        .where((p) => p.hasDeal)
        .map((p) => p.deal!.discountPct)
        .toList(growable: false);
    if (discounts.isEmpty) return null;
    return discounts.reduce(math.max);
  }

  static List<MapPinCluster> from(List<MapPin> pins) {
    final groups = <String, List<MapPin>>{};
    for (final pin in pins) {
      // Six decimal places is ~0.1 m — far finer than the 250 m displacement,
      // so this groups exactly the pins that truly share a point.
      final key = '${pin.approxLng.toStringAsFixed(6)},'
          '${pin.approxLat.toStringAsFixed(6)}';
      groups.putIfAbsent(key, () => <MapPin>[]).add(pin);
    }
    return groups.values
        .map((group) => MapPinCluster(pins: List.unmodifiable(group)))
        .toList(growable: false);
  }
}
