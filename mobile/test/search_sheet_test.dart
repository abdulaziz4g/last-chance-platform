import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lastchance_mobile/app/l10n.dart';
import 'package:lastchance_mobile/app/theme.dart';
import 'package:lastchance_mobile/app/widgets/listing_card.dart';
import 'package:lastchance_mobile/features/map/domain/map_filters.dart';
import 'package:lastchance_mobile/features/map/presentation/search_sheet.dart';

Future<SearchRequest?> pumpSheet(
  WidgetTester tester, {
  MapFilters initial = MapFilters.none,
  Locale locale = const Locale('en'),
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  SearchRequest? result;
  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      theme: themeForLocale(locale),
      supportedLocales: LcStrings.supportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        LcStrings.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(
        body: LcSearchSheet(
          initial: initial,
          onSearch: (r) => result = r,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return result;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  group('the accordion', () {
    testWidgets('opens on Where with the other sections collapsed',
        (tester) async {
      await pumpSheet(tester);
      // Expanded Where shows its own heading and the suggestion list.
      expect(find.text('Where?'), findsOneWidget);
      expect(find.text('Suggested destinations'), findsOneWidget);
      // The others are single rows, not open cards.
      expect(find.text('Add dates'), findsOneWidget);
      expect(find.text('Add guests'), findsOneWidget);
    });

    testWidgets('picking a destination advances to When', (tester) async {
      // The sheet is a sequence: answering one question should move the guest
      // on rather than leaving them to find the next card.
      await pumpSheet(tester);
      await tester.tap(find.text('AlUla'));
      await tester.pumpAndSettle();

      // Where has collapsed to a row showing the choice.
      expect(find.text('Suggested destinations'), findsNothing);
      expect(find.text('AlUla'), findsOneWidget);
    });

    testWidgets('only the real markets are offered', (tester) async {
      // A geocoder would happily suggest somewhere with no inventory; this is
      // deliberately a short fixed list.
      await pumpSheet(tester);
      expect(find.text('AlUla'), findsOneWidget);
      expect(find.text('Riyadh'), findsOneWidget);
      expect(find.text('Jeddah'), findsOneWidget);
    });

    testWidgets('typing filters the suggestions', (tester) async {
      await pumpSheet(tester);
      await tester.enterText(find.byType(TextField), 'riy');
      await tester.pumpAndSettle();
      expect(find.text('Riyadh'), findsOneWidget);
      expect(find.text('Jeddah'), findsNothing);
    });
  });

  group('the footer', () {
    testWidgets('Clear all is inert until something is set', (tester) async {
      await pumpSheet(tester);
      final button = tester.widget<TextButton>(
        find.ancestor(
          of: find.text('Clear all'),
          matching: find.byType(TextButton),
        ),
      );
      expect(button.onPressed, isNull,
          reason: 'nothing to clear should not invite a tap');
    });

    testWidgets('Clear all becomes available once a filter exists',
        (tester) async {
      await pumpSheet(tester, initial: const MapFilters(guests: 2));
      final button = tester.widget<TextButton>(
        find.ancestor(
          of: find.text('Clear all'),
          matching: find.byType(TextButton),
        ),
      );
      expect(button.onPressed, isNotNull);
    });

    testWidgets('Search returns the filters that were set', (tester) async {
      SearchRequest? captured;
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
            body: LcSearchSheet(
              initial: const MapFilters(guests: 3),
              onSearch: (r) => captured = r,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('AlUla'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Search'));
      await tester.pumpAndSettle();

      expect(captured, isNotNull);
      expect(captured!.filters.guests, 3);
      // "Where" resolves to BOUNDS, not a name — the map endpoint searches a
      // viewport, so a destination has to arrive as a box.
      expect(captured!.destination, isNotNull);
      expect(captured!.destination!.bounds.minLat, closeTo(26.55, 0.001));
    });
  });

  group('bilingual', () {
    testWidgets('renders Arabic right-to-left without overflowing',
        (tester) async {
      await pumpSheet(tester, locale: const Locale('ar'));
      expect(find.text('أين؟'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.text('أين؟'))),
        TextDirection.rtl,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('destinations are localized, not transliterated English',
        (tester) async {
      await pumpSheet(tester, locale: const Locale('ar'));
      expect(find.text('العلا'), findsOneWidget);
      expect(find.text('AlUla'), findsNothing);
    });
  });

  group('listing card', () {
    testWidgets('shows price, rating and the save toggle', (tester) async {
      var saved = false;
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
            body: LcListingCard(
              title: 'Dar Tantora',
              subtitle: 'Nabataean Suite, AlUla',
              priceMinor: 145000,
              currency: 'SAR',
              rating: 4.8,
              perUnitLabel: '/ night',
              saved: saved,
              onSavedChanged: (v) => saved = v,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Dar Tantora'), findsOneWidget);
      expect(find.textContaining('1,450'), findsOneWidget);
      expect(find.text('4.8'), findsOneWidget);

      // Outline when unsaved, so the state is legible without relying on
      // colour alone.
      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
      await tester.tap(find.byIcon(Icons.favorite_border));
      expect(saved, isTrue);
    });

    testWidgets('a listing with no photos still renders', (tester) async {
      // Hosts list before they photograph. A missing image is a normal state,
      // not an error, and must not produce a broken box on the first card.
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
          home: const Scaffold(
            body: LcListingCard(
              title: 'No photos yet',
              subtitle: 'Riyadh',
              priceMinor: 30000,
              currency: 'SAR',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.door_front_door_outlined), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
