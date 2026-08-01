import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lastchance_mobile/app/design_tokens.dart';
import 'package:lastchance_mobile/app/theme.dart';

/// Pins the tokens to the Last Chance Design & Developer Package.
///
/// These look tautological — asserting a constant equals itself — and are not.
/// They are the tripwire for a value being "adjusted" during a later visual
/// tweak: an off-spec coral is invisible in review and obvious on a phone next
/// to the printed brand sheet. A failure here means the change was to the
/// BRAND, which is a decision that belongs with the package, not in a commit
/// that was nominally about a screen.
void main() {
  // google_fonts resolves a family by fetching it unless the file is bundled.
  // A test must never depend on the network, and an un-stubbed fetch here
  // prints a wall of binding errors that buries real failures — so runtime
  // fetching is off and the resolver falls back deterministically.
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  group('colour system (package §1)', () {
    test('matches the package hex values exactly', () {
      expect(LcBrand.coral, const Color(0xFFFF5A4A), reason: 'Primary Coral');
      expect(LcBrand.background, const Color(0xFFFFF4EE),
          reason: 'Warm Background');
      expect(LcBrand.sand, const Color(0xFFF2E7DF), reason: 'Sand Beige');
      expect(LcBrand.text, const Color(0xFF2B1F1A), reason: 'Deep Brown');
      expect(LcBrand.white, const Color(0xFFFFFFFF));
    });

    test('muted taupe is 7B6B63, the value the package states twice', () {
      // A summary in circulation said #786863. The package's §1 colour table
      // and §4 brand-token block both say #7B6B63; this asserts the package.
      expect(LcBrand.muted, const Color(0xFF7B6B63));
      expect(LcBrand.muted, isNot(const Color(0xFF786863)));
    });
  });

  group('component measurements (package §2)', () {
    test('values sit inside the ranges the package specifies', () {
      // The package gives bands, not points. These assert the band, so a
      // future adjustment within spec stays green and a drift outside it does
      // not.
      expect(LcSpacing.screenPadding, inInclusiveRange(20, 24));
      expect(LcSpacing.sectionGap, inInclusiveRange(24, 32));
      expect(LcSpacing.gridGap, inInclusiveRange(12, 16));
      expect(LcRadius.card, inInclusiveRange(18, 24));
      expect(LcSize.primaryButtonHeight, inInclusiveRange(52, 56));
      expect(LcSize.bottomNavHeight, inInclusiveRange(72, 82));
      expect(LcRadius.appIconFraction, inInclusiveRange(0.22, 0.26));
    });

    test('input radius is exact, not a range', () {
      expect(LcRadius.input, 16);
    });

    test('image ratios are 16:10 for listings and 4:5 for promotions', () {
      expect(LcSize.listingAspectRatio, closeTo(1.6, 1e-9));
      expect(LcSize.promoAspectRatio, closeTo(0.8, 1e-9));
    });

    test('the card shadow is the one the package specifies', () {
      // 0 10 30 rgba(43,31,26,0.08). Alpha 0x14 is 20/255 = 0.0784, the
      // nearest 8-bit value to 8%.
      expect(LcShadow.card, hasLength(1));
      final shadow = LcShadow.card.single;
      expect(shadow.offset, const Offset(0, 10));
      expect(shadow.blurRadius, 30);
      expect(shadow.color, const Color(0x142B1F1A));
    });
  });

  group('theme derives from tokens', () {
    test('primary is coral and the canvas is the warm background', () {
      final theme = buildLightTheme();
      expect(theme.colorScheme.primary, LcBrand.coral);
      expect(theme.scaffoldBackgroundColor, LcBrand.background);
      expect(theme.brightness, Brightness.light);
    });

    test('the primary button carries the package height and radius', () {
      // Read off the THEME, not off a widget: every FilledButton in the app
      // inherits this, so asserting it here covers all of them.
      final style = buildLightTheme().filledButtonTheme.style!;
      final size = style.minimumSize!.resolve(<WidgetState>{});
      expect(size!.height, LcSize.primaryButtonHeight);

      final shape = style.shape!.resolve(<WidgetState>{})
          as RoundedRectangleBorder;
      expect(
        shape.borderRadius.resolve(TextDirection.ltr).topLeft.x,
        LcRadius.button,
      );
      expect(style.backgroundColor!.resolve(<WidgetState>{}), LcBrand.coral);
    });

    test('the bottom nav uses the package height', () {
      expect(buildLightTheme().navigationBarTheme.height, LcSize.bottomNavHeight);
    });

    test('cards carry no Material elevation, only the brand shadow', () {
      // Material elevation would tint the surface UNDER the brand shadow and
      // the card would read as two materials at once.
      expect(buildLightTheme().cardTheme.elevation, 0);
    });

    test('inputs use the exact 16 px radius', () {
      final border =
          buildLightTheme().inputDecorationTheme.border! as OutlineInputBorder;
      expect(border.borderRadius.topLeft.x, LcRadius.input);
    });
  });

  group('bilingual typography', () {
    test('Arabic and Latin resolve to different families', () {
      // Cormorant and Poppins ship no Arabic glyphs. If these ever match, the
      // Arabic build is rendering in a Latin face and every Arabic screen is
      // showing tofu or a silent system substitution.
      final latin = buildLightTheme().textTheme.bodyMedium!.fontFamily;
      final arabic = buildLightTheme(arabic: true).textTheme.bodyMedium!.fontFamily;
      expect(latin, isNotNull);
      expect(arabic, isNotNull);
      expect(arabic, isNot(latin));
    });

    test('the Arabic scale is one family throughout', () {
      // An Arabic reader should not meet a second typeface halfway down the
      // screen, so the display roles must not stay on the Latin serif.
      final theme = buildLightTheme(arabic: true).textTheme;
      expect(theme.headlineLarge!.fontFamily, theme.bodyMedium!.fontFamily);
    });

    test('Latin keeps a display face for headlines and a UI face for body', () {
      final theme = buildLightTheme().textTheme;
      expect(theme.headlineLarge!.fontFamily,
          isNot(theme.bodyMedium!.fontFamily));
    });

    test('locale picks the family without the caller branching', () {
      expect(
        themeForLocale(const Locale('ar')).textTheme.bodyMedium!.fontFamily,
        buildLightTheme(arabic: true).textTheme.bodyMedium!.fontFamily,
      );
      expect(
        themeForLocale(const Locale('en')).textTheme.bodyMedium!.fontFamily,
        buildLightTheme().textTheme.bodyMedium!.fontFamily,
      );
      // An unsupported locale must not fall into the Arabic scale.
      expect(
        themeForLocale(const Locale('fr')).textTheme.bodyMedium!.fontFamily,
        buildLightTheme().textTheme.bodyMedium!.fontFamily,
      );
    });
  });
}
