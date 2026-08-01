import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'design_tokens.dart';

/// The Last Chance theme, assembled entirely from [LcBrand] and friends.
///
/// Nothing here invents a value. If a colour or radius is needed and is not in
/// design_tokens.dart, the package did not specify it and the answer is to go
/// and look, not to pick something that matches.
///
/// LIGHT ONLY. The package describes one appearance — warm cream canvas, coral
/// accent, deep brown ink — and calls it out explicitly: "not a dark luxury
/// brand". There is no dark variant to switch to, so the app pins
/// `themeMode: ThemeMode.light` rather than leaving a device in dark mode to
/// render a half-inverted approximation of a design that has no dark form.
ThemeData buildLightTheme({bool arabic = false}) {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: const ColorScheme.light(
      primary: LcBrand.coral,
      onPrimary: LcBrand.white,
      // Sand is the secondary SURFACE, so it belongs on the container roles
      // rather than on `secondary`, which Material uses for accent fills.
      secondary: LcBrand.coral,
      onSecondary: LcBrand.white,
      secondaryContainer: LcBrand.sand,
      onSecondaryContainer: LcBrand.text,
      surface: LcBrand.white,
      onSurface: LcBrand.text,
      surfaceContainer: LcBrand.sand,
      surfaceContainerLowest: LcBrand.white,
      // The warm canvas, so a widget reading surfaceContainerHighest for a
      // soft section gets the package's background rather than Material's
      // default grey.
      surfaceContainerHighest: LcBrand.background,
      outlineVariant: LcBrand.sand,
      error: Color(0xFFB3261E),
    ),
    scaffoldBackgroundColor: LcBrand.background,
  );

  final text = _textTheme(base.textTheme, arabic: arabic);

  return base.copyWith(
    textTheme: text,
    primaryTextTheme: text,

    appBarTheme: AppBarTheme(
      backgroundColor: LcBrand.background,
      foregroundColor: LcBrand.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge,
    ),

    cardTheme: CardThemeData(
      color: LcBrand.white,
      // Zero, because the package's elevation is a specific shadow
      // (LcShadow.card) rather than Material's tonal overlay. Leaving Material
      // elevation on would paint a tinted surface UNDER the brand shadow and
      // the card would read as two materials at once.
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: LcRadius.cardBorder),
      margin: EdgeInsets.zero,
    ),

    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: LcBrand.coral,
        foregroundColor: LcBrand.white,
        minimumSize: const Size.fromHeight(LcSize.primaryButtonHeight),
        shape: RoundedRectangleBorder(borderRadius: LcRadius.buttonBorder),
        textStyle: text.labelLarge?.copyWith(fontWeight: LcType.button),
      ),
    ),

    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: LcBrand.coral,
        textStyle: text.labelLarge?.copyWith(fontWeight: LcType.button),
      ),
    ),

    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: LcBrand.text,
        side: const BorderSide(color: LcBrand.sand),
        minimumSize: const Size.fromHeight(LcSize.primaryButtonHeight),
        shape: RoundedRectangleBorder(borderRadius: LcRadius.inputBorder),
      ),
    ),

    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: LcBrand.white,
      border: OutlineInputBorder(
        borderRadius: LcRadius.inputBorder,
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: LcRadius.inputBorder,
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: LcRadius.inputBorder,
        borderSide: const BorderSide(color: LcBrand.coral, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      hintStyle: text.bodyMedium?.copyWith(color: LcBrand.muted),
      labelStyle: text.bodyMedium?.copyWith(color: LcBrand.muted),
    ),

    navigationBarTheme: NavigationBarThemeData(
      height: LcSize.bottomNavHeight,
      backgroundColor: LcBrand.white,
      indicatorColor: LcBrand.sand,
      elevation: 0,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => text.labelSmall?.copyWith(
          color: states.contains(WidgetState.selected)
              ? LcBrand.coral
              : LcBrand.muted,
          fontWeight: LcType.label,
        ),
      ),
      // Active coral, inactive taupe — the package's icon rule.
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? LcBrand.coral
              : LcBrand.muted,
        ),
      ),
    ),

    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: LcBrand.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(LcRadius.card)),
      ),
    ),

    chipTheme: ChipThemeData(
      backgroundColor: LcBrand.sand,
      selectedColor: LcBrand.coral,
      side: BorderSide.none,
      labelStyle: text.labelMedium,
      shape: RoundedRectangleBorder(borderRadius: LcRadius.pillBorder),
    ),

    dividerTheme: const DividerThemeData(color: LcBrand.sand, thickness: 1),
    iconTheme: const IconThemeData(color: LcBrand.text),
    scrollbarTheme: const ScrollbarThemeData(
      thumbColor: WidgetStatePropertyAll<Color>(LcBrand.sand),
    ),
  );
}

/// Builds the type scale.
///
/// Arabic replaces BOTH Latin families rather than being appended as a
/// fallback: Cormorant and Poppins ship no Arabic glyphs, so an Arabic string
/// in either renders as tofu or is silently swapped for a system face — the
/// layout survives and the typography does not, which is the failure mode
/// nobody catches until a native reader opens the app.
///
/// Display faces are reserved for the wordmark and editorial headings
/// (displayLarge…headlineSmall). Everything a user reads to OPERATE the app —
/// titles, body, buttons, labels — is the UI face, which is what keeps an
/// elegant serif from turning into an unreadable form label at 12 px.
TextTheme _textTheme(TextTheme base, {required bool arabic}) {
  if (arabic) {
    // One family for the whole scale: an Arabic reader should not meet a
    // second typeface halfway down the screen.
    return GoogleFonts.tajawalTextTheme(base).apply(
      bodyColor: LcBrand.text,
      displayColor: LcBrand.text,
    );
  }

  final ui = GoogleFonts.poppinsTextTheme(base).apply(
    bodyColor: LcBrand.text,
    displayColor: LcBrand.text,
  );

  TextStyle? display(TextStyle? from) => from == null
      ? null
      : GoogleFonts.cormorantGaramond(textStyle: from, color: LcBrand.text);

  return ui.copyWith(
    displayLarge: display(ui.displayLarge),
    displayMedium: display(ui.displayMedium),
    displaySmall: display(ui.displaySmall),
    headlineLarge: display(ui.headlineLarge),
    headlineMedium: display(ui.headlineMedium),
    headlineSmall: display(ui.headlineSmall),
  );
}

/// Picks the theme for a locale. The app calls this; screens never branch.
ThemeData themeForLocale(Locale? locale) =>
    buildLightTheme(arabic: locale?.languageCode == 'ar');
