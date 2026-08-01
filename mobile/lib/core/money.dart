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

/// Reads a whole-currency amount the way a guest actually types it.
///
/// A guest in Riyadh with an Arabic keyboard enters ١٤٥٠, not 1450, and
/// `int.parse` rejects that outright — so a price field that understands only
/// ASCII digits silently refuses input from the market this app is built for.
/// Arabic-Indic (U+0660–0669) and the extended Persian/Urdu set (U+06F0–06F9)
/// both map back to ASCII here.
///
/// Grouping separators are tolerated because NumberFormat emits them and a
/// guest re-typing what they were shown should not be told it is invalid: the
/// Latin comma, the Arabic comma (U+060C), the Arabic thousands separator
/// (U+066C), and the space forms NumberFormat uses (including U+00A0 and
/// U+202F). Anything else — a decimal point, a currency symbol, a letter —
/// returns null rather than a silently wrong number.
int? parseWholeAmount(String input) {
  const groupingSeparators = <int>{
    0x2C, // ,
    0x060C, // ، Arabic comma
    0x066C, // ٬ Arabic thousands separator
    0x20, // space
    0x00A0, // no-break space
    0x202F, // narrow no-break space
    0x2009, // thin space
  };

  final digits = StringBuffer();
  for (final rune in input.trim().runes) {
    if (rune >= 0x30 && rune <= 0x39) {
      digits.writeCharCode(rune);
    } else if (rune >= 0x0660 && rune <= 0x0669) {
      digits.writeCharCode(rune - 0x0660 + 0x30);
    } else if (rune >= 0x06F0 && rune <= 0x06F9) {
      digits.writeCharCode(rune - 0x06F0 + 0x30);
    } else if (groupingSeparators.contains(rune)) {
      continue;
    } else {
      return null;
    }
  }

  // Empty means "no bound", which is a valid state the caller distinguishes
  // from a parse failure — hence null for both, with emptiness checked first
  // by the caller.
  final text = digits.toString();
  if (text.isEmpty) return null;
  return int.tryParse(text);
}

/// mm:ss for the hold countdown; never negative.
String formatCountdown(Duration remaining) {
  final clamped = remaining.isNegative ? Duration.zero : remaining;
  final minutes = clamped.inMinutes.toString().padLeft(2, '0');
  final seconds = (clamped.inSeconds % 60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
