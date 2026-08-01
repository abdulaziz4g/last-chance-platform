import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/app/l10n.dart';
import 'package:lastchance_mobile/app/theme.dart';
import 'package:lastchance_mobile/features/map/domain/map_filters.dart';
import 'package:lastchance_mobile/features/map/presentation/filter_sheet.dart';

/// Mounts the sheet inside the real localization stack, so direction comes
/// from the locale exactly as it does in the app.
Future<MapFilters?> pumpSheet(
  WidgetTester tester, {
  MapFilters initial = MapFilters.none,
  Locale locale = const Locale('en'),
  String currency = 'SAR',
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  MapFilters? applied;
  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      theme: buildLightTheme(),
      supportedLocales: LcStrings.supportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        LcStrings.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(
        body: MapFilterSheet(
          initial: initial,
          currency: currency,
          onApply: (value) => applied = value,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return applied;
}

/// The apply button, found by role rather than by label so the assertion holds
/// in both languages.
Finder applyButton() => find.byType(FilledButton);

bool applyEnabled(WidgetTester tester) =>
    tester.widget<FilledButton>(applyButton()).onPressed != null;

void main() {
  group('renders', () {
    testWidgets('in English without overflowing a 390 px phone', (tester) async {
      await pumpSheet(tester);
      expect(find.text('Filters'), findsOneWidget);
      expect(find.text('Any dates'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('in Arabic right-to-left without overflowing', (tester) async {
      // Arabic renders longer than English for the same content, so a layout
      // sized to English only overflows the first time it is seen in Arabic.
      await pumpSheet(tester, locale: const Locale('ar'));
      expect(find.text('عوامل التصفية'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.text('عوامل التصفية'))),
        TextDirection.rtl,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('labels prices with the currency it was given', (tester) async {
      // Not hardcoded SAR: a viewport in another market must not put the wrong
      // unit on the guest's own numbers.
      await pumpSheet(tester, currency: 'AED');
      expect(find.text('AED '), findsNWidgets(2));
    });

    testWidgets('keeps digits left-to-right inside an Arabic layout',
        (tester) async {
      // Numbers read LTR in every locale; without an explicit direction the
      // field inherits RTL and a typed figure visually reverses as it grows.
      await pumpSheet(tester, locale: const Locale('ar'));
      final field = tester.widget<TextField>(find.byType(TextField).first);
      expect(field.textDirection, TextDirection.ltr);
    });
  });

  group('price bounds', () {
    testWidgets('a typed ceiling becomes minor units on apply', (tester) async {
      MapFilters? applied;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildLightTheme(),
          supportedLocales: LcStrings.supportedLocales,
          localizationsDelegates: const <LocalizationsDelegate<Object>>[
            LcStrings.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Scaffold(
            body: MapFilterSheet(
              initial: MapFilters.none,
              currency: 'SAR',
              onApply: (value) => applied = value,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).last, '900');
      await tester.pumpAndSettle();
      await tester.tap(applyButton());
      await tester.pumpAndSettle();

      // 900 whole SAR is 90000 halalas — the unit the API and the pins use.
      expect(applied?.maxPriceMinor, 90000);
      expect(applied?.minPriceMinor, isNull);
    });

    testWidgets('an inverted band blocks apply and says why', (tester) async {
      await pumpSheet(tester);

      await tester.enterText(find.byType(TextField).first, '900');
      await tester.enterText(find.byType(TextField).last, '100');
      await tester.pumpAndSettle();

      expect(find.text('The maximum must be at least the minimum'),
          findsOneWidget);
      expect(applyEnabled(tester), isFalse);
    });

    testWidgets('an equal min and max is a valid band', (tester) async {
      await pumpSheet(tester);
      await tester.enterText(find.byType(TextField).first, '500');
      await tester.enterText(find.byType(TextField).last, '500');
      await tester.pumpAndSettle();
      expect(applyEnabled(tester), isTrue);
    });

    testWidgets('unparseable text blocks apply rather than widening the search',
        (tester) async {
      // The dangerous failure: treating a malformed field as "no bound" would
      // silently search wider than the guest asked for.
      await pumpSheet(tester);
      await tester.enterText(find.byType(TextField).first, '12.50');
      await tester.pumpAndSettle();
      expect(applyEnabled(tester), isFalse);
    });

    testWidgets('accepts Arabic-Indic digits typed into the field',
        (tester) async {
      MapFilters? applied;
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('ar'),
          theme: buildLightTheme(),
          supportedLocales: LcStrings.supportedLocales,
          localizationsDelegates: const <LocalizationsDelegate<Object>>[
            LcStrings.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Scaffold(
            body: MapFilterSheet(
              initial: MapFilters.none,
              currency: 'SAR',
              onApply: (value) => applied = value,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).last, '٩٠٠');
      await tester.pumpAndSettle();
      await tester.tap(applyButton());
      await tester.pumpAndSettle();

      expect(applied?.maxPriceMinor, 90000);
    });

    testWidgets('an existing bound is shown in whole units, not minor ones',
        (tester) async {
      await pumpSheet(
        tester,
        initial: const MapFilters(maxPriceMinor: 90000),
      );
      final field = tester.widget<TextField>(find.byType(TextField).last);
      expect(field.controller?.text, '900');
    });
  });

  group('guests', () {
    testWidgets('starts at "any" and steps up from there', (tester) async {
      await pumpSheet(tester);
      expect(find.text('Any'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();
      expect(find.text('1 guest'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();
      expect(find.text('2 guests'), findsOneWidget);
    });

    testWidgets('stepping below one returns to "any", not to zero',
        (tester) async {
      // Zero guests is not a search anyone means to run.
      await pumpSheet(tester, initial: const MapFilters(guests: 1));
      await tester.tap(find.byIcon(Icons.remove));
      await tester.pumpAndSettle();
      expect(find.text('Any'), findsOneWidget);
    });

    testWidgets('caps at the largest party the filter can express',
        (tester) async {
      await pumpSheet(tester, initial: const MapFilters(guests: kMaxGuests));
      final addButton = tester.widget<IconButton>(
        find.ancestor(
          of: find.byIcon(Icons.add),
          matching: find.byType(IconButton),
        ),
      );
      expect(addButton.onPressed, isNull);
    });
  });

  group('applying', () {
    testWidgets('commits the whole draft in a single call', (tester) async {
      // The reason the sheet edits a draft at all: several edits, one search.
      var calls = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildLightTheme(),
          supportedLocales: LcStrings.supportedLocales,
          localizationsDelegates: const <LocalizationsDelegate<Object>>[
            LcStrings.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Scaffold(
            body: MapFilterSheet(
              initial: MapFilters.none,
              currency: 'SAR',
              onApply: (_) => calls++,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, '900');
      await tester.pumpAndSettle();
      expect(calls, 0, reason: 'edits must not search until Apply');

      await tester.tap(applyButton());
      await tester.pumpAndSettle();
      expect(calls, 1);
    });

    testWidgets('clear all empties every field at once', (tester) async {
      await pumpSheet(
        tester,
        initial: const MapFilters(guests: 3, maxPriceMinor: 90000),
      );
      expect(find.text('3 guests'), findsOneWidget);

      await tester.tap(find.text('Clear all'));
      await tester.pumpAndSettle();

      expect(find.text('Any'), findsOneWidget);
      final field = tester.widget<TextField>(find.byType(TextField).last);
      expect(field.controller?.text, isEmpty);
    });

    testWidgets('clear all is offered only when something is set',
        (tester) async {
      await pumpSheet(tester);
      expect(find.text('Clear all'), findsNothing);

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();
      expect(find.text('Clear all'), findsOneWidget);
    });
  });

  group('availability', () {
    testWidgets('explains that dates are what filter by availability',
        (tester) async {
      // There is no separate availability switch because the server has no
      // such option: supplying dates IS the filter, and it always applies.
      await pumpSheet(tester);
      expect(find.text('Pick dates to filter by availability'), findsOneWidget);
    });

    testWidgets('states the filter is in force once dates are set',
        (tester) async {
      await pumpSheet(
        tester,
        initial: MapFilters(
          checkInUtc: DateTime.utc(2026, 8, 3),
          checkOutUtc: DateTime.utc(2026, 8, 5),
        ),
      );
      expect(find.text('Only stays free on these dates'), findsOneWidget);
    });
  });
}
