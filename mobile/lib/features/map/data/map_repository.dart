import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../booking/domain/booking.dart';
import '../domain/map_pin.dart';

/// Everything the viewport endpoint accepts.
class MapSearchQuery {
  const MapSearchQuery({
    required this.bounds,
    required this.bookingType,
    this.checkInUtc,
    this.checkOutUtc,
    this.guests,
    this.minPriceMinor,
    this.maxPriceMinor,
    this.limit,
  });

  final MapBounds bounds;
  final BookingType bookingType;
  final DateTime? checkInUtc;
  final DateTime? checkOutUtc;
  final int? guests;

  /// Minor units, matched against the discounted price the pin displays. Null
  /// means unbounded on that side; 0 is a real floor and must survive the trip.
  final int? minPriceMinor;
  final int? maxPriceMinor;

  final int? limit;

  /// True when a date range is fully specified. Sending half a range makes the
  /// server reject the request outright rather than silently dropping the
  /// availability filter — so the controller checks this before sending.
  bool get hasCompleteDateRange => checkInUtc != null && checkOutUtc != null;

  Map<String, dynamic> toQueryParameters() {
    final params = <String, dynamic>{
      'min_lng': bounds.minLng,
      'min_lat': bounds.minLat,
      'max_lng': bounds.maxLng,
      'max_lat': bounds.maxLat,
      'booking_type': bookingType.wire,
    };
    if (hasCompleteDateRange) {
      params['check_in_utc'] = checkInUtc!.toUtc().toIso8601String();
      params['check_out_utc'] = checkOutUtc!.toUtc().toIso8601String();
    }
    if (guests != null) params['guests'] = guests;
    // `!= null`, never a truthiness check: a 0 floor is a filter the guest set
    // deliberately, and dropping it would quietly widen their search.
    if (minPriceMinor != null) params['min_price_minor'] = minPriceMinor;
    if (maxPriceMinor != null) params['max_price_minor'] = maxPriceMinor;
    if (limit != null) params['limit'] = limit;
    return params;
  }
}

class MapRepository {
  const MapRepository(this._dio);

  final Dio _dio;

  /// Viewport search.
  ///
  /// [cancelToken] is not optional decoration: a map pan emits a bounds change
  /// per frame, and without cancellation several responses race so the slowest
  /// one wins and paints stale pins over the current view.
  Future<MapSearchResult> search(
    MapSearchQuery query, {
    CancelToken? cancelToken,
  }) {
    return guardApi(() async {
      final res = await _dio.get<Map<String, dynamic>>(
        '/units/map-search',
        queryParameters: query.toQueryParameters(),
        cancelToken: cancelToken,
      );
      return MapSearchResult.fromJson(res.data!);
    });
  }
}

final mapRepositoryProvider = Provider<MapRepository>(
  (ref) => MapRepository(ref.watch(dioProvider)),
);
