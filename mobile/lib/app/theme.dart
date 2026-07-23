import 'package:flutter/material.dart';

/// The mobile expression of the platform design language — same near-black
/// ink canvas and single brass accent as the web console.
abstract final class LcColors {
  static const Color ink950 = Color(0xFF0A0A0C);
  static const Color ink900 = Color(0xFF131316);
  static const Color brass300 = Color(0xFFD8BD92);
  static const Color brass400 = Color(0xFFC8A878);
  static const Color brass500 = Color(0xFFB49164);
  static const Color danger = Color(0xFFFB7185);
  static const Color success = Color(0xFF34D399);
}

ThemeData buildDarkTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: const ColorScheme.dark(
      surface: LcColors.ink950,
      surfaceContainer: LcColors.ink900,
      primary: LcColors.brass400,
      onPrimary: LcColors.ink950,
      secondary: LcColors.brass300,
      error: LcColors.danger,
    ),
    scaffoldBackgroundColor: LcColors.ink950,
  );

  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: LcColors.ink950,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: LcColors.ink900,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0x0FFFFFFF)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: LcColors.brass400,
        foregroundColor: LcColors.ink950,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
  );
}
