import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../config.dart';

/// Single WebSocket connection to the backend availability gateway
/// (/ws/availability). Subscribes to all events (availability + deals) and
/// exposes a broadcast stream of parsed JSON frames. Consumers filter and
/// parse their own domain types. Reconnects with exponential backoff.
class RealtimeService {
  RealtimeService(this._wsUrl);

  final String _wsUrl;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _disposed = false;

  final _events = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get events => _events.stream;

  void connect() {
    if (_disposed) return;
    _disconnect();

    try {
      _channel = WebSocketChannel.connect(Uri.parse(_wsUrl));
    } catch (_) {
      _scheduleReconnect();
      return;
    }

    _channel!.sink.add(jsonEncode(<String, dynamic>{
      'action': 'subscribe',
      'all': true,
    }));

    _sub = _channel!.stream.listen(
      (dynamic raw) {
        try {
          final json = jsonDecode(raw as String) as Map<String, dynamic>;
          final type = json['type'] as String? ?? '';
          if (type != 'SUBSCRIBED' && type != 'ERROR') {
            _events.add(json);
          }
        } catch (_) {}
      },
      onDone: _scheduleReconnect,
      onError: (_) => _scheduleReconnect(),
      cancelOnError: false,
    );

    _reconnectAttempts = 0;
  }

  void _disconnect() {
    _reconnectTimer?.cancel();
    _sub?.cancel();
    _sub = null;
    _channel?.sink.close();
    _channel = null;
  }

  void _scheduleReconnect() {
    if (_disposed) return;
    _reconnectAttempts++;
    final delaySec = (_reconnectAttempts * 2).clamp(1, 30);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(seconds: delaySec), connect);
  }

  void dispose() {
    _disposed = true;
    _disconnect();
    _events.close();
  }
}

final realtimeServiceProvider = Provider<RealtimeService>((ref) {
  final service = RealtimeService(LcConfig.wsAvailabilityUrl)..connect();
  ref.onDispose(service.dispose);
  return service;
});
