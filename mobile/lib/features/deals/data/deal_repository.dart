import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../booking/domain/booking.dart';
import '../domain/flash_deal.dart';

class ClaimDealRequest {
  const ClaimDealRequest({
    required this.guestId,
    required this.bookingType,
    required this.checkInUtc,
    required this.checkOutUtc,
    required this.guestsCount,
  });

  final String guestId;
  final BookingType bookingType;
  final DateTime checkInUtc;
  final DateTime checkOutUtc;
  final int guestsCount;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'guestId': guestId,
        'bookingType': bookingType.wire,
        'checkInUtc': checkInUtc.toUtc().toIso8601String(),
        'checkOutUtc': checkOutUtc.toUtc().toIso8601String(),
        'guestsCount': guestsCount,
      };
}

class DealRepository {
  const DealRepository(this._dio);

  final Dio _dio;

  Future<List<FlashDeal>> getActiveDeals() {
    return guardApi(() async {
      final res = await _dio.get<List<dynamic>>('/deals/active');
      return (res.data ?? <dynamic>[])
          .map((e) => FlashDeal.fromJson(e as Map<String, dynamic>))
          .toList();
    });
  }

  /// Claim a deal → the backend atomically decrements inventory AND returns a
  /// discounted PENDING_PAYMENT booking. A 409 FLASH_DEAL_SOLD_OUT or
  /// UNIT_UNAVAILABLE surfaces as an [ApiException] the flow controller maps.
  Future<Booking> claim(String dealId, ClaimDealRequest request) {
    return guardApi(() async {
      final res = await _dio.post<Map<String, dynamic>>(
        '/deals/$dealId/claim',
        data: request.toJson(),
      );
      return Booking.fromJson(res.data!);
    });
  }
}

final dealRepositoryProvider = Provider<DealRepository>(
  (ref) => DealRepository(ref.watch(dioProvider)),
);
