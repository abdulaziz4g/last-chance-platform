import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lastchance_mobile/app/design_tokens.dart';
import 'package:lastchance_mobile/app/l10n.dart';
import 'package:lastchance_mobile/app/shell.dart';
import 'package:lastchance_mobile/app/theme.dart';
import 'package:lastchance_mobile/features/map/data/map_repository.dart';
import 'package:lastchance_mobile/features/map/domain/map_pin.dart';
import 'package:lastchance_mobile/features/messages/presentation/messages_screen.dart';
import 'package:lastchance_mobile/features/profile/presentation/profile_screen.dart';
import 'package:lastchance_mobile/features/trips/presentation/trips_screen.dart';
import 'package:lastchance_mobile/features/wishlists/presentation/wishlists_screen.dart';

import 'map_screen_test.dart' show samplePins;

class _FakeMapRepository extends MapRepository {
  _FakeMapRepository() : super(Dio());

  @override
  Future<MapSearchResult> search(
    MapSearchQuery query, {
    CancelToken? cancelToken,
  }) async =>
      MapSearchResult(pins: samplePins(), truncated: false);
}

Future<void> pumpShell(
  WidgetTester tester, {
  Locale locale = const Locale('en'),
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        mapRepositoryProvider.overrideWithValue(_FakeMapRepository()),
      ],
      child: MaterialApp(
        locale: locale,
        theme: themeForLocale(locale),
        supportedLocales: LcStrings.supportedLocales,
        localizationsDelegates: const <LocalizationsDelegate<Object>>[
          LcStrings.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const LcShell(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  group('the five sections', () {
    testWidgets('all five are reachable from the bar', (tester) async {
      await pumpShell(tester);
      final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(bar.destinations, hasLength(5));

      for (final label in <String>[
        'Explore',
        'Wishlists',
        'Trips',
        'Messages',
        'Profile',
      ]) {
        expect(find.text(label), findsWidgets, reason: '$label tab missing');
      }
    });

    testWidgets('tapping a tab shows that section', (tester) async {
      await pumpShell(tester);

      await tester.tap(find.text('Trips'));
      await tester.pumpAndSettle();
      expect(find.byType(TripsScreen), findsOneWidget);

      await tester.tap(find.text('Messages'));
      await tester.pumpAndSettle();
      expect(find.byType(MessagesScreen), findsOneWidget);

      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      expect(find.byType(ProfileScreen), findsOneWidget);

      await tester.tap(find.text('Wishlists'));
      await tester.pumpAndSettle();
      expect(find.byType(WishlistsScreen), findsOneWidget);
    });

    testWidgets('sections stay alive across a tab switch', (tester) async {
      // IndexedStack, not a rebuild: a guest who scrolls Explore, checks Trips
      // and comes back should find Explore where they left it rather than
      // re-fetched from the top.
      //
      // skipOffstage: false is load-bearing. IndexedStack wraps the inactive
      // children in Offstage, and finders skip offstage widgets by default —
      // so the DEFAULT finder cannot tell "kept but hidden" from "disposed",
      // which is the exact distinction under test.
      await pumpShell(tester);
      expect(
        find.byType(WishlistsScreen, skipOffstage: false),
        findsOneWidget,
        reason: 'every section is built once and kept',
      );

      await tester.tap(find.text('Trips'));
      await tester.pumpAndSettle();

      expect(
        find.byType(WishlistsScreen, skipOffstage: false),
        findsOneWidget,
        reason: 'switching away must not dispose the other sections',
      );
      // ...and it is genuinely hidden rather than stacked on top of Trips.
      expect(find.byType(WishlistsScreen), findsNothing);
      expect(find.byType(TripsScreen), findsOneWidget);
    });
  });

  group('brand', () {
    testWidgets('the bar takes its height from the package token',
        (tester) async {
      await pumpShell(tester);
      final theme = Theme.of(tester.element(find.byType(NavigationBar)));
      expect(theme.navigationBarTheme.height, LcSize.bottomNavHeight);
    });

    testWidgets('the canvas is the package cream, not Material grey',
        (tester) async {
      await pumpShell(tester);
      final theme = Theme.of(tester.element(find.byType(LcShell)));
      expect(theme.scaffoldBackgroundColor, LcBrand.background);
      expect(theme.colorScheme.primary, LcBrand.coral);
    });
  });

  group('bilingual', () {
    testWidgets('the bar is Arabic right-to-left without overflowing',
        (tester) async {
      // Five labels in one bar is the tightest row in the app, and Arabic
      // renders wider — this is where it would break first.
      await pumpShell(tester, locale: const Locale('ar'));

      expect(
        Directionality.of(tester.element(find.byType(LcShell))),
        TextDirection.rtl,
      );
      expect(find.text('استكشف'), findsWidgets);
      expect(find.text('المفضلة'), findsWidgets);
      expect(find.text('رحلاتي'), findsWidgets);
      expect(find.text('الرسائل'), findsWidgets);
      expect(find.text('حسابي'), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('no English leaks into the Arabic shell', (tester) async {
      await pumpShell(tester, locale: const Locale('ar'));
      for (final english in <String>['Explore', 'Trips', 'Profile']) {
        expect(find.text(english), findsNothing, reason: '"$english" untranslated');
      }
    });
  });
}
