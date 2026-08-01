import 'package:intl/intl.dart';

/// Money is integer minor units everywhere in transit and in state; doubles
/// exist ONLY at this last formatting step. Mirrors web/src/lib/format.ts.
String formatMinor(int amountMinor, String currency, {String locale = 'en_US'}) {
  final format = NumberFormat.currency(
    locale: locale,
    symbol: '$currency ',
    decimalDigits: 2,
  );
  return format.format(amountMinor / 100);
}

/// Whole-currency form for dense surfaces — map pins and list rows, where two
/// decimal places are noise at that size. Locale-aware because Arabic groups
/// and renders digits differently, and a hardcoded en_US price inside an
/// otherwise Arabic layout is the tell that a screen was never localized.
String formatMinorCompact(
  int amountMinor,
  String currency, {
  String locale = 'en_US',
}) {
  final format = NumberFormat.currency(
    locale: locale,
    symbol: '$currency ',
    decimalDigits: 0,
  );
  return format.format(amountMinor / 100);
}

/// mm:ss for the hold countdown; never negative.
String formatCountdown(Duration remaining) {
  final clamped = remaining.isNegative ? Duration.zero : remaining;
  final minutes = clamped.inMinutes.toString().padLeft(2, '0');
  final seconds = (clamped.inSeconds % 60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
