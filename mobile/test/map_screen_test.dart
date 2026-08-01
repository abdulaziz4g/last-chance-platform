import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/app/l10n.dart';
import 'package:lastchance_mobile/app/theme.dart';
import 'package:lastchance_mobile/features/map/data/map_repository.dart';
import 'package:lastchance_mobile/features/map/domain/map_pin.dart';
import 'package:lastchance_mobile/features/map/presentation/filter_sheet.dart';
import 'package:lastchance_mobile/features/map/presentation/map_screen.dart';
import 'package:lastchance_mobile/features/map/presentation/pin_detail_sheet.dart';
import 'package:lastchance_mobile/features/map/presentation/tile_layer.dart';

import 'map_domain_test.dart' show pinJson;

class _FakeMapRepository extends MapRepository {
  _FakeMapRepository(this.pins) : super(Dio());

  final List<MapPin> pins;

  @override
  Future<MapSearchResult> search(
    MapSearchQuery query, {
    CancelToken? cancelToken,
  }) async =>
      MapSearchResult(pins: pins, truncated: false);
}

/// Two units at one property (they share a coordinate) plus one elsewhere
/// carrying a live deal — the shapes the map has to get right.
List<MapPin> samplePins() => <MapPin>[
      MapPin.fromJson(pinJson(unitId: 'a', unitName: 'Nabataean Suite', price: 145000, basePrice: 145000)),
      MapPin.fromJson(pinJson(unitId: 'b', unitName: 'Courtyard Room', price: 92000, basePrice: 92000)),
      MapPin.fromJson(
        pinJson(
          unitId: 'c',
          lng: 37.9553,
          lat: 26.7869,
          basePrice: 118000,
          price: 88500,
          deal: <String, dynamic>{
            'dealId': 'd1',
            'discountPct': 25,
            'endsAt': null,
          },
        ),
      ),
    ];

Widget wrap(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
      locale: locale,
      theme: buildLightTheme(),
      supportedLocales: LcStrings.supportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        LcStrings.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: child,
    );

Future<void> pumpMap(
  WidgetTester tester, {
  List<MapPin>? pins,
  Locale locale = const Locale('en'),
}) async {
  tester.view.physicalSize = const Size(390 * 3, 800 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        mapRepositoryProvider
            .overrideWithValue(_FakeMapRepository(pins ?? samplePins())),
      ],
      child: wrap(const MapScreen(), locale: locale),
    ),
  );
  await tester.pumpAndSettle();
}

/// Controls inside the filter sheet, scoped so they cannot collide with the
/// map's own — the zoom control and the guest stepper both use Icons.add, and
/// the detail sheet also carries a FilledButton.
Finder addGuestButton() => find.descendant(
      of: find.byType(MapFilterSheet),
      matching: find.byIcon(Icons.add),
    );

Finder applyButton() => find.descendant(
      of: find.byType(MapFilterSheet),
      matching: find.byType(FilledButton),
    );

void main() {
  testWidgets('renders the token-less layer when no token is configured',
      (tester) async {
    await pumpMap(tester);

    // MAPBOX_ACCESS_TOKEN is not defined in a test run, so the screen must
    // degrade rather than show nothing — that degradation is what makes the
    // whole feature reviewable before anyone buys an account.
    expect(find.byType(NoTokenTileLayer), findsOneWidget);
    expect(find.byType(MapboxTileLayer), findsNothing);
  });

  testWidgets('clusters co-located units into one pin', (tester) async {
    await pumpMap(tester);

    // Two units share a property coordinate and one sits elsewhere, so three
    // pins must become two markers. Stacked markers are untappable on touch.
    expect(find.textContaining('SAR'), findsWidgets);
    final fromPin = find.textContaining('from');
    expect(fromPin, findsOneWidget,
        reason: 'the shared-coordinate marker shows a "from" price');
  });

  testWidgets('the cheapest unit sets the cluster price', (tester) async {
    await pumpMap(tester);
    // 92,000 minor is the cheaper of the two co-located units.
    expect(find.textContaining('920'), findsWidgets);
  });

  testWidgets('tapping a single-unit pin opens the detail sheet',
      (tester) async {
    await pumpMap(tester);

    // The deal pin is the standalone one.
    await tester.tap(find.textContaining('885').first);
    await tester.pumpAndSettle();

    expect(find.byType(PinDetailSheet), findsOneWidget);
    // The privacy disclosure must travel with the selection.
    expect(find.textContaining('500 m'), findsOneWidget);
    expect(find.textContaining('confirmed'), findsOneWidget);
  });

  testWidgets('tapping a clustered pin asks which unit rather than guessing',
      (tester) async {
    await pumpMap(tester);

    await tester.tap(find.textContaining('from').first);
    await tester.pumpAndSettle();

    // A tap on a marker representing several units cannot mean one of them.
    expect(find.textContaining('units at this property'), findsOneWidget);
    expect(find.text('Nabataean Suite'), findsWidgets);
  });

  testWidgets('the list view shows every unit, not the clusters',
      (tester) async {
    await pumpMap(tester);

    await tester.tap(find.text('List view'));
    await tester.pumpAndSettle();

    // Clustering is a map affordance; a list has room for all three.
    expect(find.text('Hegra Desert Camp'), findsNWidgets(3));
  });

  testWidgets('an empty result explains itself', (tester) async {
    await pumpMap(tester, pins: <MapPin>[]);

    await tester.tap(find.text('List view'));
    await tester.pumpAndSettle();

    expect(find.text('No stays in this area yet'), findsOneWidget);
  });

  testWidgets('renders right-to-left in Arabic without overflowing',
      (tester) async {
    await pumpMap(tester, locale: const Locale('ar'));

    expect(
      Directionality.of(tester.element(find.byType(MapScreen))),
      TextDirection.rtl,
    );
    expect(find.text('الإقامات على الخريطة'), findsOneWidget);
    // An overflow in RTL is the classic failure of a layout only ever seen in
    // English; takeException catches it.
    expect(tester.takeException(), isNull);
  });

  testWidgets('the stay-type toggle is offered in both modes', (tester) async {
    await pumpMap(tester);
    expect(find.text('Nightly'), findsOneWidget);
    expect(find.text('By the hour'), findsOneWidget);

    await tester.tap(find.text('By the hour'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  group('filters', () {
    testWidgets('the filter button opens the overlay', (tester) async {
      await pumpMap(tester);

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();

      expect(find.byType(MapFilterSheet), findsOneWidget);
    });

    testWidgets('no filter chip is shown until something is applied',
        (tester) async {
      await pumpMap(tester);
      expect(find.textContaining('filter'), findsNothing);
    });

    testWidgets('an applied filter shows on the map and clears from there',
        (tester) async {
      await pumpMap(tester);

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      // Scoped to the sheet: the map's own zoom control uses Icons.add too,
      // so a bare byIcon finder matches two widgets.
      await tester.tap(addGuestButton());
      await tester.pumpAndSettle();
      await tester.tap(applyButton());
      await tester.pumpAndSettle();

      // A guest who filtered, panned away and came back to an empty valley
      // must be able to see WHY it is empty without reopening the sheet.
      expect(find.text('1 filter'), findsOneWidget);

      await tester.tap(find.text('1 filter'));
      await tester.pumpAndSettle();
      expect(find.text('1 filter'), findsNothing);
    });

    testWidgets('the filter entry point survives Arabic without overflowing',
        (tester) async {
      await pumpMap(tester, locale: const Locale('ar'));

      await tester.tap(find.byIcon(Icons.tune));
      await tester.pumpAndSettle();
      await tester.tap(addGuestButton());
      await tester.pumpAndSettle();
      await tester.tap(applyButton());
      await tester.pumpAndSettle();

      // The count chip and the filter chip sit in one bounded row; Arabic
      // renders both wider, which is exactly when it would overflow.
      //
      // Matched on the label alone, not on the full interpolated string: RTL
      // makes the count APPEAR at the other end, and asserting the rendered
      // order rather than the stored one is a trap worth not setting.
      expect(find.textContaining('عامل تصفية'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
