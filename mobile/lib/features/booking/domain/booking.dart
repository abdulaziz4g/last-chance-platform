/// Booking domain — a 1:1 typed mirror of the API contract (which itself
/// mirrors the PostgreSQL enums). Wire names are the single source of truth.
enum BookingStatus {
  draft('DRAFT'),
  pendingPayment('PENDING_PAYMENT'),
  confirmed('CONFIRMED'),
  checkedIn('CHECKED_IN'),
  completed('COMPLETED'),
  cancelled('CANCELLED'),
  expired('EXPIRED'),
  refunded('REFUNDED');

  const BookingStatus(this.wire);
  final String wire;

  static BookingStatus fromWire(String value) =>
      values.firstWhere((s) => s.wire == value);

  /// Must match the DB exclusion-constraint predicate.
  bool get holdsInventory =>
      this == pendingPayment || this == confirmed || this == checkedIn;
}

enum BookingType {
  hourly('HOURLY'),
  nightly('NIGHTLY');

  const BookingType(this.wire);
  final String wire;

  static BookingType fromWire(String value) =>
      values.firstWhere((t) => t.wire == value);
}

class Booking {
  const Booking({
    required this.id,
    required this.bookingCode,
    required this.guestId,
    required this.unitId,
    required this.propertyId,
    required this.type,
    required this.status,
    required this.checkInUtc,
    required this.checkOutUtc,
    required this.guestsCount,
    required this.holdExpiresAt,
    required this.currency,
    required this.baseAmountMinor,
    required this.cleaningFeeMinor,
    required this.serviceFeeMinor,
    required this.taxesMinor,
    required this.discountMinor,
    required this.totalAmountMinor,
    required this.flashDealId,
  });

  factory Booking.fromJson(Map<String, dynamic> json) {
    return Booking(
      id: json['id'] as String,
      bookingCode: json['bookingCode'] as String,
      guestId: json['guestId'] as String,
      unitId: json['unitId'] as String,
      propertyId: json['propertyId'] as String,
      type: BookingType.fromWire(json['bookingType'] as String),
      status: BookingStatus.fromWire(json['status'] as String),
      checkInUtc: DateTime.parse(json['checkInUtc'] as String).toUtc(),
      checkOutUtc: DateTime.parse(json['checkOutUtc'] as String).toUtc(),
      guestsCount: (json['guestsCount'] as num).toInt(),
      holdExpiresAt: json['holdExpiresAt'] == null
          ? null
          : DateTime.parse(json['holdExpiresAt'] as String).toUtc(),
      currency: json['currency'] as String,
      baseAmountMinor: (json['baseAmountMinor'] as num).toInt(),
      cleaningFeeMinor: (json['cleaningFeeMinor'] as num).toInt(),
      serviceFeeMinor: (json['serviceFeeMinor'] as num).toInt(),
      taxesMinor: (json['taxesMinor'] as num).toInt(),
      discountMinor: (json['discountMinor'] as num).toInt(),
      totalAmountMinor: (json['totalAmountMinor'] as num).toInt(),
      flashDealId: json['flashDealId'] as String?,
    );
  }

  final String id;
  final String bookingCode;
  final String guestId;
  final String unitId;
  final String propertyId;
  final BookingType type;
  final BookingStatus status;
  final DateTime checkInUtc;
  final DateTime checkOutUtc;
  final int guestsCount;
  final DateTime? holdExpiresAt;
  final String currency;
  final int baseAmountMinor;
  final int cleaningFeeMinor;
  final int serviceFeeMinor;
  final int taxesMinor;
  final int discountMinor;
  final int totalAmountMinor;

  /// Present when this hold was placed by claiming a flash deal.
  final String? flashDealId;

  Duration get stayDuration => checkOutUtc.difference(checkInUtc);

  /// Remaining payment-hold time at [now]; zero when lapsed or not held.
  Duration holdRemaining(DateTime now) {
    final expiresAt = holdExpiresAt;
    if (expiresAt == null || status != BookingStatus.pendingPayment) {
      return Duration.zero;
    }
    final remaining = expiresAt.difference(now);
    return remaining.isNegative ? Duration.zero : remaining;
  }
}

class PlaceHoldRequest {
  const PlaceHoldRequest({
    required this.guestId,
    required this.unitId,
    required this.type,
    required this.checkInUtc,
    required this.checkOutUtc,
    required this.guestsCount,
  });

  final String guestId;
  final String unitId;
  final BookingType type;
  final DateTime checkInUtc;
  final DateTime checkOutUtc;
  final int guestsCount;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'guestId': guestId,
        'unitId': unitId,
        'bookingType': type.wire,
        'checkInUtc': checkInUtc.toUtc().toIso8601String(),
        'checkOutUtc': checkOutUtc.toUtc().toIso8601String(),
        'guestsCount': guestsCount,
        'source': 'ANDROID',
      };
}
