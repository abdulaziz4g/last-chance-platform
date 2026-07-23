import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../../core/money.dart';

/// The signature UX of the platform: the 10-minute payment-hold countdown.
/// Brass while healthy, danger red inside the final minute, [onExpired] once
/// at zero. [clock] is injectable so tests control time deterministically.
class HoldCountdown extends StatefulWidget {
  const HoldCountdown({
    super.key,
    required this.expiresAt,
    this.onExpired,
    this.clock,
  });

  final DateTime expiresAt;
  final VoidCallback? onExpired;
  final DateTime Function()? clock;

  @override
  State<HoldCountdown> createState() => _HoldCountdownState();
}

class _HoldCountdownState extends State<HoldCountdown> {
  Timer? _ticker;
  late Duration _remaining;
  bool _expiredFired = false;

  DateTime _now() => (widget.clock ?? DateTime.now)();

  @override
  void initState() {
    super.initState();
    _remaining = _compute();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  Duration _compute() {
    final d = widget.expiresAt.difference(_now());
    return d.isNegative ? Duration.zero : d;
  }

  void _tick() {
    final next = _compute();
    setState(() => _remaining = next);
    if (next == Duration.zero && !_expiredFired) {
      _expiredFired = true;
      _ticker?.cancel();
      widget.onExpired?.call();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final urgent = _remaining < const Duration(minutes: 1);
    return Column(
      children: <Widget>[
        Text(
          'RESERVED FOR YOU',
          style: TextStyle(
            fontSize: 11,
            letterSpacing: 3,
            fontWeight: FontWeight.w600,
            color: Colors.white.withValues(alpha: 0.5),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          formatCountdown(_remaining),
          style: TextStyle(
            fontSize: 56,
            fontWeight: FontWeight.w600,
            fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
            color: urgent ? LcColors.danger : LcColors.brass300,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          urgent ? 'Complete payment now' : 'Complete payment to confirm',
          style: TextStyle(
            fontSize: 13,
            color: Colors.white.withValues(alpha: 0.6),
          ),
        ),
      ],
    );
  }
}
