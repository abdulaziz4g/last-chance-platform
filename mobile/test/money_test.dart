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
}
