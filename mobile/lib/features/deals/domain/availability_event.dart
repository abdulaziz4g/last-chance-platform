/// Typed mirror of the backend's Redis-published availability events
/// (backend: booking-events.publisher.ts, channel `lc.events.availability`).
///
/// TRANSPORT CONTRACT (Phase 6): the WebSocket gateway relays this exact JSON
/// per subscribed unit/property, which is what makes a flash-deal unit
/// visibly "gone" on every device sub-second. Until the gateway ships, the
/// hold screen observes its own booking via polling (BookingWatcher); this
/// model and the [AvailabilityFeed] interface are the stable seam.
class AvailabilityEvent {
  const AvailabilityEvent({
    required this.type,
    required this.unitId,
    required this.propertyId,
    required this.bookingId,
    required this.checkInUtc,
    required this.checkOutUtc,
    required this.occurredAt,
  });

  factory AvailabilityEvent.fromJson(Map<String, dynamic> json) {
    return AvailabilityEvent(
      type: AvailabilityEventType.fromWire(json['type'] as String),
      unitId: json['unitId'] as String,
      propertyId: json['propertyId'] as String,
      bookingId: json['bookingId'] as String,
      checkInUtc: DateTime.parse(json['checkInUtc'] as String).toUtc(),
      checkOutUtc: DateTime.parse(json['checkOutUtc'] as String).toUtc(),
      occurredAt: DateTime.parse(json['occurredAt'] as String).toUtc(),
    );
  }

  final AvailabilityEventType type;
  final String unitId;
  final String propertyId;
  final String bookingId;
  final DateTime checkInUtc;
  final DateTime checkOutUtc;
  final DateTime occurredAt;
}

enum AvailabilityEventType {
  holdPlaced('HOLD_PLACED'),
  bookingConfirmed('BOOKING_CONFIRMED'),
  inventoryReleased('INVENTORY_RELEASED');

  const AvailabilityEventType(this.wire);
  final String wire;

  static AvailabilityEventType fromWire(String value) =>
      values.firstWhere((t) => t.wire == value);
}

/// Implementations: WebSocketAvailabilityFeed (Phase 6 gateway).
abstract interface class AvailabilityFeed {
  Stream<AvailabilityEvent> forUnit(String unitId);
  Stream<AvailabilityEvent> forProperty(String propertyId);
}
