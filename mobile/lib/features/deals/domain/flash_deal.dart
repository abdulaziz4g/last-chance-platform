/// Flash-deal view model — 1:1 with the API's FlashDealView (GET /deals/active).
/// Money is integer minor units; instants are UTC.
enum FlashDealStatus {
  scheduled('SCHEDULED'),
  active('ACTIVE'),
  soldOut('SOLD_OUT'),
  ended('ENDED'),
  cancelled('CANCELLED');

  const FlashDealStatus(this.wire);
  final String wire;

  static FlashDealStatus fromWire(String value) =>
      values.firstWhere((s) => s.wire == value);
}

class FlashDeal {
  const FlashDeal({
    required this.id,
    required this.unitId,
    required this.propertyId,
    required this.propertyName,
    required this.unitName,
    required this.city,
    required this.title,
    required this.discountPct,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.quantityTotal,
    required this.quantityClaimed,
    required this.quantityRemaining,
    required this.currency,
    required this.baseHourlyRateMinor,
    required this.baseNightlyRateMinor,
    required this.secondsRemaining,
  });

  factory FlashDeal.fromJson(Map<String, dynamic> json) {
    return FlashDeal(
      id: json['id'] as String,
      unitId: json['unitId'] as String,
      propertyId: json['propertyId'] as String,
      propertyName: json['propertyName'] as String,
      unitName: json['unitName'] as String,
      city: json['city'] as String,
      title: json['title'] as String,
      discountPct: (json['discountPct'] as num).toDouble(),
      status: FlashDealStatus.fromWire(json['status'] as String),
      startsAt: DateTime.parse(json['startsAt'] as String).toUtc(),
      endsAt: DateTime.parse(json['endsAt'] as String).toUtc(),
      quantityTotal: (json['quantityTotal'] as num).toInt(),
      quantityClaimed: (json['quantityClaimed'] as num).toInt(),
      quantityRemaining: (json['quantityRemaining'] as num).toInt(),
      currency: json['currency'] as String,
      baseHourlyRateMinor: (json['baseHourlyRateMinor'] as num?)?.toInt(),
      baseNightlyRateMinor: (json['baseNightlyRateMinor'] as num?)?.toInt(),
      secondsRemaining: (json['secondsRemaining'] as num).toInt(),
    );
  }

  final String id;
  final String unitId;
  final String propertyId;
  final String propertyName;
  final String unitName;
  final String city;
  final String title;
  final double discountPct;
  final FlashDealStatus status;
  final DateTime startsAt;
  final DateTime endsAt;
  final int quantityTotal;
  final int quantityClaimed;
  final int quantityRemaining;
  final String currency;
  final int? baseHourlyRateMinor;
  final int? baseNightlyRateMinor;
  final int secondsRemaining;

  /// The headline rate for this deal (hourly preferred), original + net.
  int? get baseRateMinor => baseHourlyRateMinor ?? baseNightlyRateMinor;

  int? get netRateMinor {
    final base = baseRateMinor;
    return base == null ? null : (base * (1 - discountPct / 100)).round();
  }

  bool get isHourly => baseHourlyRateMinor != null;

  /// Live seconds left, computed against [now] (falls back to the server seed).
  int remainingSecondsAt(DateTime now) {
    final left = endsAt.difference(now).inSeconds;
    return left < 0 ? 0 : left;
  }
}
