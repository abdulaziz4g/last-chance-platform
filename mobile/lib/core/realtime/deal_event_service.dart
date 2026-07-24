import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'realtime_service.dart';

enum DealEventType { dealActivated, dealClaimed, dealSoldOut, dealEnded, other }

class DealEvent {
  const DealEvent({
    required this.type,
    required this.dealId,
    required this.unitId,
    required this.quantityRemaining,
  });

  factory DealEvent.fromJson(Map<String, dynamic> json) {
    final typeStr = json['type'] as String? ?? '';
    return DealEvent(
      type: switch (typeStr) {
        'DEAL_ACTIVATED' => DealEventType.dealActivated,
        'DEAL_CLAIMED' => DealEventType.dealClaimed,
        'DEAL_SOLD_OUT' => DealEventType.dealSoldOut,
        'DEAL_ENDED' => DealEventType.dealEnded,
        _ => DealEventType.other,
      },
      dealId: json['dealId'] as String? ?? '',
      unitId: json['unitId'] as String? ?? '',
      quantityRemaining: (json['quantityRemaining'] as num?)?.toInt() ?? 0,
    );
  }

  final DealEventType type;
  final String dealId;
  final String unitId;
  final int quantityRemaining;
}

/// Thin typed layer over [RealtimeService] — filters for DEAL_* events and
/// parses them into [DealEvent]. No connection management of its own.
class DealEventService {
  DealEventService(this._realtime);
  final RealtimeService _realtime;

  Stream<DealEvent> get events => _realtime.events
      .where((json) => (json['type'] as String? ?? '').startsWith('DEAL_'))
      .map(DealEvent.fromJson);
}

final dealEventServiceProvider = Provider<DealEventService>((ref) {
  return DealEventService(ref.watch(realtimeServiceProvider));
});
