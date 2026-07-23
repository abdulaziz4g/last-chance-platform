import 'package:intl/intl.dart';

/// Money is integer minor units everywhere in transit and in state; doubles
/// exist ONLY at this last formatting step. Mirrors web/src/lib/format.ts.
String formatMinor(int amountMinor, String currency) {
  final format = NumberFormat.currency(
    locale: 'en_US',
    symbol: '$currency ',
    decimalDigits: 2,
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
