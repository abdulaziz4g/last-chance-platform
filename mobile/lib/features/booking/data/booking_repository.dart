import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/realtime/realtime_service.dart';
import '../domain/booking.dart';

class BookingRepository {
  const BookingRepository(this._dio);

  final Dio _dio;

  Future<Booking> placeHold(PlaceHoldRequest request) {
    return guardApi(() async {
      final res = await _dio.post<Map<String, dynamic>>(
        '/bookings/hold',
        data: request.toJson(),
      );
      return Booking.fromJson(res.data!);
    });
  }

  Future<Booking> getById(String bookingId) {
    return guardApi(() async {
      final res = await _dio.get<Map<String, dynamic>>('/bookings/$bookingId');
      return Booking.fromJson(res.data!);
    });
  }

  Future<Booking> cancel(String bookingId, {String? reason}) {
    return guardApi(() async {
      final res = await _dio.post<Map<String, dynamic>>(
        '/bookings/$bookingId/cancel',
        data: <String, dynamic>{'cancelledBy': 'GUEST', 'reason': reason},
      );
      return Booking.fromJson(res.data!);
    });
  }

}

final bookingRepositoryProvider = Provider<BookingRepository>(
  (ref) => BookingRepository(ref.watch(dioProvider)),
);

/// Watches a booking for status transitions via the WebSocket availability
/// gateway (fast path) with a 10s poll fallback (safety net if WS is down).
class BookingWatcher {
  const BookingWatcher(this._repository, this._realtime);

  final BookingRepository _repository;
  final RealtimeService _realtime;

  Stream<Booking> watch(String bookingId) async* {
    // Initial fetch catches any transition that raced the WS subscription.
    final initial = await _repository.getById(bookingId);
    yield initial;
    if (initial.status != BookingStatus.pendingPayment) return;

    // Merge WS push (sub-second) with a 10s poll fallback.
    final trigger = StreamController<void>();
    final wsSub = _realtime.events
        .where((json) =>
            json['bookingId'] == bookingId &&
            (json['type'] == 'BOOKING_CONFIRMED' ||
                json['type'] == 'INVENTORY_RELEASED'))
        .listen((_) {
      if (!trigger.isClosed) trigger.add(null);
    });
    final poll = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!trigger.isClosed) trigger.add(null);
    });

    try {
      await for (final _ in trigger.stream) {
        final booking = await _repository.getById(bookingId);
        yield booking;
        if (booking.status != BookingStatus.pendingPayment) return;
      }
    } finally {
      await wsSub.cancel();
      poll.cancel();
      await trigger.close();
    }
  }
}

final bookingWatcherProvider = Provider<BookingWatcher>(
  (ref) => BookingWatcher(
    ref.watch(bookingRepositoryProvider),
    ref.watch(realtimeServiceProvider),
  ),
);
