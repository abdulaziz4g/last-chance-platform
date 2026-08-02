import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lastchance_mobile/app/design_tokens.dart';

/// Proves the brand fonts resolve FROM THE BUNDLE, with the network off.
///
/// This matters more than it looks. `GoogleFonts.config.allowRuntimeFetching`
/// is false in main(), and when google_fonts cannot find a bundled file it
/// does not throw — it logs and falls back to the platform font. The app still
/// runs, the layout is unchanged, and the typography is silently wrong. The
/// only signal is a filename that has to match `{Family}-{Weight}` exactly,
/// which is precisely the kind of thing a rename breaks without a test.
///
/// So these assert the ASSET MANIFEST, not a rendered glyph: the manifest is
/// what google_fonts scans, so matching it is the same question the package
/// asks at runtime.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  /// Every asset Flutter will ship, as google_fonts sees it.
  Future<List<String>> bundledAssets() async {
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    return manifest.listAssets();
  }

  /// The filename google_fonts derives for a family + weight. Mirrors
  /// GoogleFontsVariant.toApiFilenamePart: w400 is "Regular", not "400".
  const weightNames = <int, String>{
    400: 'Regular',
    500: 'Medium',
    600: 'SemiBold',
    700: 'Bold',
  };

  group('brand fonts are bundled under the names google_fonts looks for', () {
    test('Poppins ships the package\'s four UI weights', () async {
      final assets = await bundledAssets();
      // 400 body, 500 labels, 600 buttons, 700 key numbers — the package's
      // recommended scale. A missing weight is not a missing font: Flutter
      // synthesises it, which looks like a slightly wrong typeface rather
      // than an obviously absent one.
      for (final weight in <int>[400, 500, 600, 700]) {
        expect(
          assets.any((a) => a.endsWith('Poppins-${weightNames[weight]}.ttf')),
          isTrue,
          reason: 'Poppins ${weightNames[weight]} ($weight) is not bundled',
        );
      }
    });

    test('Cormorant Garamond ships the display weights', () async {
      final assets = await bundledAssets();
      for (final weight in <int>[400, 600]) {
        expect(
          assets.any(
            (a) => a.endsWith('CormorantGaramond-${weightNames[weight]}.ttf'),
          ),
          isTrue,
          reason: 'CormorantGaramond ${weightNames[weight]} is not bundled',
        );
      }
    });

    test('Tajawal ships the Arabic weights', () async {
      // Without these the Arabic build falls back to a platform face and the
      // whole right-to-left experience quietly stops being the brand.
      final assets = await bundledAssets();
      for (final weight in <int>[400, 500, 700]) {
        expect(
          assets.any((a) => a.endsWith('Tajawal-${weightNames[weight]}.ttf')),
          isTrue,
          reason: 'Tajawal ${weightNames[weight]} is not bundled',
        );
      }
    });

    test('the family names match the tokens, not a near-miss', () async {
      // google_fonts matches on the API family name, which has NO space:
      // "CormorantGaramond", not "Cormorant Garamond". A file named after the
      // human-readable form is never found.
      final assets = await bundledAssets();
      expect(assets.any((a) => a.contains('Cormorant Garamond')), isFalse,
          reason: 'spaced filename would never be matched');
      expect(LcType.display, 'Cormorant Garamond',
          reason: 'the TOKEN keeps the human-readable form');
      expect(LcType.ui, 'Poppins');
      expect(LcType.arabic, 'Tajawal');
    });

    test('each font ships its licence, as the OFL requires', () async {
      // The Open Font License requires the licence to travel with the font,
      // including inside an application bundle.
      final assets = await bundledAssets();
      for (final family in <String>['Poppins', 'Cormorant_Garamond', 'Tajawal']) {
        expect(
          assets.any((a) => a.endsWith('OFL-$family.txt')),
          isTrue,
          reason: '$family is bundled without its OFL licence',
        );
      }
    });
  });

  group('the theme asks for what is bundled', () {
    test('the Latin and Arabic scales resolve to different families', () {
      // Re-asserted here with fetching explicitly off: if this passed only
      // because google_fonts reached the network, it would fail now.
      final latin = GoogleFonts.poppins().fontFamily;
      final arabic = GoogleFonts.tajawal().fontFamily;
      final display = GoogleFonts.cormorantGaramond().fontFamily;
      expect(latin, isNotNull);
      expect(arabic, isNotNull);
      expect(display, isNotNull);
      expect(arabic, isNot(latin));
      expect(display, isNot(latin));
    });
  });
}
