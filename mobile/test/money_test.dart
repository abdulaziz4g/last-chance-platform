import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/core/money.dart';

void main() {
  group('formatMinor', () {
    test('renders minor units as currency', () {
      expect(formatMinor(37904, 'SAR'), 'SAR 379.04');
      expect(formatMinor(0, 'SAR'), 'SAR 0.00');
      expect(formatMinor(100, 'USD'), 'USD 1.00');
      expect(formatMinor(1234567, 'SAR'), 'SAR 12,345.67');
    });
  });

  group('formatCountdown', () {
    test('renders mm:ss and never goes negative', () {
      expect(formatCountdown(const Duration(minutes: 10)), '10:00');
      expect(
        formatCountdown(const Duration(minutes: 9, seconds: 59)),
        '09:59',
      );
      expect(formatCountdown(const Duration(seconds: 5)), '00:05');
      expect(formatCountdown(Duration.zero), '00:00');
      expect(formatCountdown(const Duration(seconds: -30)), '00:00');
    });
  });

  group('parseWholeAmount', () {
    test('reads plain ASCII digits', () {
      expect(parseWholeAmount('1450'), 1450);
      expect(parseWholeAmount('0'), 0);
      expect(parseWholeAmount('  920  '), 920);
    });

    test('reads Arabic-Indic digits', () {
      // The whole point: a guest on an Arabic keyboard types ١٤٥٠, and
      // int.parse rejects it outright.
      expect(parseWholeAmount('١٤٥٠'), 1450);
      expect(parseWholeAmount('٩٢٠'), 920);
      expect(parseWholeAmount('٠'), 0);
    });

    test('reads the extended Persian/Urdu digit set', () {
      expect(parseWholeAmount('۱۴۵۰'), 1450);
    });

    test('tolerates the grouping separators NumberFormat emits', () {
      // A guest re-typing the figure they were just shown must not be told it
      // is invalid.
      expect(parseWholeAmount('1,450'), 1450);
      expect(parseWholeAmount('12,345'), 12345);
      expect(parseWholeAmount('1٬450'), 1450); // Arabic thousands separator
      expect(parseWholeAmount('1،450'), 1450); // Arabic comma
      expect(parseWholeAmount('1 450'), 1450); // no-break space
      expect(parseWholeAmount('1 450'), 1450); // narrow no-break space
    });

    test('mixes digit systems rather than guessing one', () {
      expect(parseWholeAmount('1٤5٠'), 1450);
    });

    test('rejects anything that is not a whole number', () {
      // Null rather than a silently wrong figure: 14.50 must never become
      // 1450, which is what stripping the point would do.
      expect(parseWholeAmount('14.50'), isNull);
      expect(parseWholeAmount('cheap'), isNull);
      expect(parseWholeAmount('SAR 1450'), isNull);
      expect(parseWholeAmount('-50'), isNull);
      expect(parseWholeAmount('1450٪'), isNull);
    });

    test('an empty or separator-only field is null, meaning no bound', () {
      expect(parseWholeAmount(''), isNull);
      expect(parseWholeAmount('   '), isNull);
      expect(parseWholeAmount(','), isNull);
    });
  });
}
