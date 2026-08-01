import 'package:dio/dio.dart';

/// Typed mirror of the backend's error envelope:
///   { "error": { "code", "message", "details", "requestId" } }
/// UI never branches on HTTP status — always on [code].
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.requestId,
  });

  final String code;
  final String message;
  final int? statusCode;
  final String? requestId;

  bool get isUnitUnavailable => code == 'UNIT_UNAVAILABLE';
  bool get isHoldExpired => code == 'HOLD_EXPIRED';
  bool get isSoldOut => code == 'FLASH_DEAL_SOLD_OUT';
  bool get isNetwork => code == 'NETWORK';

  /// We abandoned this request ourselves. Callers must swallow it rather than
  /// surfacing anything — there is nothing for the user to act on.
  bool get isCancelled => code == 'CANCELLED';

  @override
  String toString() => 'ApiException($code: $message)';
}

/// Wrap every repository call: Dio errors become [ApiException]s.
Future<T> guardApi<T>(Future<T> Function() fn) async {
  try {
    return await fn();
  } on DioException catch (e) {
    // A deliberately cancelled request is not a failure. Without this it fell
    // through to code 'NETWORK', so every superseded map pan would have shown
    // the user a connection error for a request we abandoned on purpose.
    if (e.type == DioExceptionType.cancel) {
      throw const ApiException(
        code: 'CANCELLED',
        message: 'Request superseded',
      );
    }

    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final error = data['error'];
      if (error is Map<String, dynamic>) {
        throw ApiException(
          code: (error['code'] as String?) ?? 'UNKNOWN',
          message: (error['message'] as String?) ?? 'Request failed',
          statusCode: e.response?.statusCode,
          requestId: error['requestId'] as String?,
        );
      }
    }
    throw ApiException(
      code: 'NETWORK',
      message: e.message ?? 'Network error',
      statusCode: e.response?.statusCode,
    );
  }
}
