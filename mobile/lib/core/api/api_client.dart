import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';

/// Single Dio instance for the app. The dev actor header matches the backend
/// contract until Phase-6 JWT auth replaces it with an auth interceptor —
/// the repositories will not change.
Dio buildDio({String? baseUrl}) {
  return Dio(
    BaseOptions(
      baseUrl: baseUrl ?? LcConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 12),
      headers: <String, String>{'x-actor-type': 'GUEST'},
    ),
  );
}

final dioProvider = Provider<Dio>((ref) => buildDio());
