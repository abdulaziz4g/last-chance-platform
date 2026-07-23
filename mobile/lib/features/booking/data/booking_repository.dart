import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
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

  /// DEV SHORTCUT ONLY. Production confirmation is webhook-driven (the PSP
  /// SDK completes payment; the backend confirms on the capture webhook and
  /// the app observes it via [BookingWatcher]). This manual confirm exists so
  /// the flow is drivable before the PSP SDK integration lands.
  Future<Booking> confirmDev(String bookingId) {
    return guardApi(() async {
      final res = await _dio.post<Map<String, dynamic>>(
        '/bookings/$bookingId/confirm',
        data: <String, dynamic>{'paymentRef': 'mobile-dev-shortcut'},
      );
      return Booking.fromJson(res.data!);
    });
  }
}

final bookingRepositoryProvider = Provider<BookingRepository>(
  (ref) => BookingRepository(ref.watch(dioProvider)),
);

/// Polls a booking until it leaves PENDING_PAYMENT — how the app notices the
/// webhook-driven CONFIRMED (or EXPIRED) transition. Replaced by a push
/// update over the Phase-6 WebSocket gateway; the stream shape stays.
class BookingWatcher {
  const BookingWatcher(this._repository);

  final BookingRepository _repository;

  Stream<Booking> watch(
    String bookingId, {
    Duration every = const Duration(seconds: 2),
  }) async* {
    while (true) {
      final booking = await _repository.getById(bookingId);
      yield booking;
      if (booking.status != BookingStatus.pendingPayment) return;
      await Future<void>.delayed(every);
    }
  }
}

final bookingWatcherProvider = Provider<BookingWatcher>(
  (ref) => BookingWatcher(ref.watch(bookingRepositoryProvider)),
);
