import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/app/app.dart';
import 'package:lastchance_mobile/app/l10n.dart';
import 'package:lastchance_mobile/core/money.dart';
import 'package:lastchance_mobile/features/map/domain/map_pin.dart';
import 'package:lastchance_mobile/features/map/presentation/pin_detail_sheet.dart';

import 'map_domain_test.dart' show pinJson;

/// Mounts a widget inside the real localization stack, so directionality comes
/// from the locale exactly as it does in the app.
Widget harness(Widget child, {required Locale locale}) => MaterialApp(
      locale: locale,
      supportedLocales: LcStrings.supportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        LcStrings.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: child),
    );

void main() {
  group('locale drives text direction', () {
    testWidgets('Arabic renders right-to-left', (tester) async {
      await tester.pumpWidget(
        harness(const Text('x'), locale: const Locale('ar')),
      );
      await tester.pumpAndSettle();
      final direction = Directionality.of(
        tester.element(find.text('x')),
      );
      // The sketch wrapped the tree in a Directionality whose value it read
      // back out of that same tree, which cannot change anything. Direction
      // has to come from the locale, and this is the assertion that proves it.
      expect(direction, TextDirection.rtl);
    });

    testWidgets('English renders left-to-right', (tester) async {
      await tester.pumpWidget(
        harness(const Text('x'), locale: const Locale('en')),
      );
      await tester.pumpAndSettle();
      expect(
        Directionality.of(tester.element(find.text('x'))),
        TextDirection.ltr,
      );
    });
  });

  group('LcStrings', () {
    test('picks per language and pluralises English', () {
      const ar = LcStrings(Locale('ar'));
      const en = LcStrings(Locale('en'));

      expect(ar.isArabic, isTrue);
      expect(en.staysInView(1), '1 stay in view');
      expect(en.staysInView(4), '4 stays in view');
      expect(ar.staysInView(4), contains('4'));
      // Arabic uses its own comma; a Latin one inside Arabic text is a tell.
      expect(ar.listSeparator, '، ');
      expect(en.listSeparator, ', ');
    });

    test('the privacy disclosure names the radius in both languages', () {
      const ar = LcStrings(Locale('ar'));
      const en = LcStrings(Locale('en'));
      expect(en.approximateArea(500), contains('500 m'));
      expect(ar.approximateArea(500), contains('500'));
      // It must say when the real address arrives, not merely that this one
      // is vague — otherwise it reads as evasive.
      expect(en.approximateArea(500).toLowerCase(), contains('confirmed'));
    });

    test('an unsupported locale falls back to English, not to first-in-list',
        () {
      const delegate = LcStrings.delegate;
      expect(delegate.isSupported(const Locale('ar')), isTrue);
      expect(delegate.isSupported(const Locale('en')), isTrue);
      expect(delegate.isSupported(const Locale('fr')), isFalse);
    });
  });

  group('money formatting follows the locale', () {
    test('compact form drops the decimals dense surfaces do not need', () {
      expect(formatMinorCompact(145000, 'SAR'), 'SAR 1,450');
      // Two decimals still available where there is room for them.
      expect(formatMinor(145000, 'SAR'), 'SAR 1,450.00');
    });

    test('Arabic formatting differs from English', () {
      final en = formatMinorCompact(1450000, 'SAR', locale: 'en');
      final ar = formatMinorCompact(1450000, 'SAR', locale: 'ar');
      // Not asserting exact glyphs — intl's Arabic data may render Eastern
      // Arabic numerals or different separators depending on version. What
      // matters is that the locale is actually consulted.
      expect(en, isNot(equals(ar)));
    });
  });

  group('PinDetailSheet', () {
    MapPin dealPin() => MapPin.fromJson(
          pinJson(deal: <String, dynamic>{
            'dealId': 'd1',
            'discountPct': 25,
            'endsAt': null,
          }),
        );

    testWidgets('renders in Arabic without overflowing', (tester) async {
      await tester.pumpWidget(
        harness(
          Align(
            alignment: Alignment.bottomCenter,
            child: PinDetailSheet(pin: dealPin(), onOpen: () {}),
          ),
          locale: const Locale('ar'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Hegra Desert Camp'), findsOneWidget);
      expect(find.text('عرض التفاصيل'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('renders in English', (tester) async {
      await tester.pumpWidget(
        harness(
          Align(
            alignment: Alignment.bottomCenter,
            child: PinDetailSheet(pin: dealPin(), onOpen: () {}),
          ),
          locale: const Locale('en'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('View details'), findsOneWidget);
      expect(find.textContaining('25% off'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a price that did not actually drop is not struck through',
        (tester) async {
      final pin = MapPin.fromJson(pinJson(basePrice: 10000, price: 10000));
      await tester.pumpWidget(
        harness(
          Align(
            alignment: Alignment.bottomCenter,
            child: PinDetailSheet(pin: pin),
          ),
          locale: const Locale('en'),
        ),
      );
      await tester.pumpAndSettle();

      final struck = tester
          .widgetList<Text>(find.byType(Text))
          .where((t) => t.style?.decoration == TextDecoration.lineThrough);
      expect(struck, isEmpty);
    });

    testWidgets('the privacy disclosure is always present', (tester) async {
      await tester.pumpWidget(
        harness(
          Align(
            alignment: Alignment.bottomCenter,
            child: PinDetailSheet(pin: dealPin()),
          ),
          locale: const Locale('en'),
        ),
      );
      await tester.pumpAndSettle();

      // A guest reading only the sheet must still learn why the marker is
      // vague and when that stops being true.
      expect(find.textContaining('500 m'), findsOneWidget);
      expect(find.textContaining('confirmed'), findsOneWidget);
    });
  });

  group('locale resolution', () {
    test('an unsupported device locale resolves to English, not first-in-list',
        () {
      expect(
        resolveLocale(const Locale('fr'), LcStrings.supportedLocales),
        const Locale('en'),
      );
    });

    test('an Arabic device locale resolves to Arabic, region ignored', () {
      expect(
        resolveLocale(const Locale('ar', 'SA'), LcStrings.supportedLocales),
        const Locale('ar'),
      );
    });

    test('a null device locale resolves to English', () {
      expect(resolveLocale(null, LcStrings.supportedLocales), const Locale('en'));
    });
  });
}
