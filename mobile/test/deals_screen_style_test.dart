import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lastchance_mobile/app/design_tokens.dart';
import 'package:lastchance_mobile/app/l10n.dart';
import 'package:lastchance_mobile/app/theme.dart';
import 'package:lastchance_mobile/features/deals/application/deals_feed_controller.dart';
import 'package:lastchance_mobile/features/deals/domain/flash_deal.dart';
import 'package:lastchance_mobile/features/deals/presentation/deals_screen.dart';

/// Asserts the home screen actually WEARS the design package.
///
/// There is no emulator on this machine and mapbox_maps_flutter is
/// mobile-only, so the app cannot be screenshotted here. These assertions are
/// the substitute, and they outlast a screenshot anyway: a screenshot proves
/// one moment, this fails the build the day someone paints a card grey.
/// The card computes its countdown from `endsAt` against live time, not from
/// the `secondsRemaining` field — so the fixture's end must be RELATIVE to now
/// or the rendered label drifts with the calendar.
Map<String, dynamic> dealJson({
  String id = 'd1',
  double discountPct = 25,
  int quantityRemaining = 2,
  Duration endsIn = const Duration(hours: 2),
}) =>
    <String, dynamic>{
      'id': id,
      'unitId': 'u1',
      'propertyId': 'p1',
      'propertyName': 'Dar Tantora',
      'unitName': 'Nabataean Suite',
      'city': 'AlUla',
      'title': 'Tonight only',
      'discountPct': discountPct,
      'status': 'ACTIVE',
      'startsAt':
          DateTime.now().toUtc().subtract(const Duration(hours: 1)).toIso8601String(),
      'endsAt': DateTime.now().toUtc().add(endsIn).toIso8601String(),
      'quantityTotal': 5,
      'quantityClaimed': 3,
      'quantityRemaining': quantityRemaining,
      'currency': 'SAR',
      'baseHourlyRateMinor': 20000,
      'baseNightlyRateMinor': 145000,
      'secondsRemaining': endsIn.inSeconds,
    };

class _FakeFeed extends DealsFeedController {
  _FakeFeed(this._deals);
  final List<FlashDeal> _deals;

  @override
  Future<List<FlashDeal>> build() async => _deals;
}

Future<void> pumpDeals(
  WidgetTester tester, {
  Locale locale = const Locale('en'),
  List<Map<String, dynamic>>? deals,
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final list = (deals ?? <Map<String, dynamic>>[dealJson()])
      .map(FlashDeal.fromJson)
      .toList();

  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        dealsFeedProvider.overrideWith(() => _FakeFeed(list)),
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
        home: const DealsScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// The card's painted box — the thing a reviewer would look at.
BoxDecoration cardDecoration(WidgetTester tester) {
  final ink = tester.widgetList<Ink>(find.byType(Ink)).firstWhere(
        (w) => w.decoration is BoxDecoration,
      );
  return ink.decoration! as BoxDecoration;
}

/// The countdown label, matched by SHAPE rather than by an exact string: it
/// ticks once a second, so any literal would be flaky by construction.
final _countdownPattern = RegExp(r'^(\d+h \d+m \d{2}s|\d+:\d{2})$');

Color? countdownColour(WidgetTester tester) {
  final text = tester
      .widgetList<Text>(find.byType(Text))
      .firstWhere((t) => _countdownPattern.hasMatch(t.data ?? ''));
  return text.style?.color;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  group('the home screen wears the package', () {
    testWidgets('canvas is the warm background, not Material grey',
        (tester) async {
      await pumpDeals(tester);
      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      expect(
        scaffold.backgroundColor ??
            Theme.of(tester.element(find.byType(DealsScreen)))
                .scaffoldBackgroundColor,
        LcBrand.background,
      );
    });

    testWidgets('deal cards are white with the single brand shadow',
        (tester) async {
      await pumpDeals(tester);
      final decoration = cardDecoration(tester);

      expect(decoration.color, LcBrand.white);
      // Exactly the package's shadow — not a second, softer one added later
      // "to make it pop", which is how a surface stops reading as one material.
      expect(decoration.boxShadow, LcShadow.card);
    });

    testWidgets('card corners use the package radius', (tester) async {
      await pumpDeals(tester);
      final radius = cardDecoration(tester).borderRadius!
          .resolve(TextDirection.ltr)
          .topLeft
          .x;
      expect(radius, LcRadius.card);
      expect(radius, inInclusiveRange(18, 24), reason: 'package §2 band');
    });

    testWidgets('no coral hairline border survives on the card',
        (tester) async {
      // The card used to carry a 30%-alpha coral stroke. Spending the loudest
      // colour in the palette on every container leaves nothing louder for the
      // price inside it.
      await pumpDeals(tester);
      expect(cardDecoration(tester).border, isNull);
    });

    testWidgets('the price is coral and the countdown is not', (tester) async {
      await pumpDeals(tester);

      // baseRateMinor prefers the HOURLY rate when both exist, so this is
      // 20000 less 25% = 15000 — "SAR 150.00", not the nightly figure.
      final price = tester.widget<Text>(find.textContaining('150.00').first);
      expect(price.style?.color, LcBrand.coral);

      // Over an hour left, so the countdown must be ink — urgency and the call
      // to action must never be the same colour.
      expect(countdownColour(tester), LcBrand.text);
    });

    testWidgets('inside the final hour the countdown turns to danger',
        (tester) async {
      await pumpDeals(
        tester,
        deals: <Map<String, dynamic>>[
          dealJson(endsIn: const Duration(minutes: 10)),
        ],
      );
      expect(countdownColour(tester), LcStatus.danger);
      expect(countdownColour(tester), isNot(LcBrand.coral));
    });
  });

  group('bilingual', () {
    testWidgets('renders Arabic right-to-left without overflowing',
        (tester) async {
      await pumpDeals(tester, locale: const Locale('ar'));

      expect(
        Directionality.of(tester.element(find.byType(DealsScreen))),
        TextDirection.rtl,
      );
      expect(find.text('عروض سريعة'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the remaining-stock line is localized, not English',
        (tester) async {
      // This string was hardcoded English before the restyle; an Arabic build
      // showed "2 of 5 left" in the middle of an Arabic card.
      await pumpDeals(tester, locale: const Locale('ar'));
      expect(find.textContaining('بقي'), findsOneWidget);
      expect(find.textContaining('left'), findsNothing);
    });

    testWidgets('Arabic uses the Arabic type family', (tester) async {
      await pumpDeals(tester, locale: const Locale('ar'));
      final title = tester.widget<Text>(find.text('عروض سريعة'));
      final resolved = DefaultTextStyle.of(
        tester.element(find.text('عروض سريعة')),
      ).style;
      expect(
        title.style?.fontFamily ?? resolved.fontFamily,
        isNot(buildLightTheme().textTheme.bodyMedium!.fontFamily),
      );
    });
  });
}
