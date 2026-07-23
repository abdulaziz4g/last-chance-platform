import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';

class InitiatedPayment {
  const InitiatedPayment({
    required this.paymentId,
    required this.status,
    required this.providerPaymentId,
    required this.clientAction,
  });

  factory InitiatedPayment.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'] as Map<String, dynamic>;
    return InitiatedPayment(
      paymentId: payment['id'] as String,
      status: payment['status'] as String,
      providerPaymentId: payment['providerPaymentId'] as String?,
      clientAction: json['clientAction'] as Map<String, dynamic>?,
    );
  }

  final String paymentId;
  final String status;
  final String? providerPaymentId;

  /// Provider handoff: Stripe client_secret, redirect URL, etc. The PSP SDK
  /// consumes this; capture then arrives at the backend via webhook.
  final Map<String, dynamic>? clientAction;
}

class PaymentRepository {
  const PaymentRepository(this._dio);

  final Dio _dio;

  Future<InitiatedPayment> initiate({
    required String bookingId,
    String provider = 'MOCK',
    String method = 'MADA',
  }) {
    return guardApi(() async {
      final res = await _dio.post<Map<String, dynamic>>(
        '/payments/initiate',
        data: <String, dynamic>{
          'bookingId': bookingId,
          'provider': provider,
          'method': method,
        },
      );
      return InitiatedPayment.fromJson(res.data!);
    });
  }
}

final paymentRepositoryProvider = Provider<PaymentRepository>(
  (ref) => PaymentRepository(ref.watch(dioProvider)),
);
