import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../features/deals/presentation/deals_screen.dart';
import 'l10n.dart';
import 'theme.dart';

/// Picks the locale to run in.
///
/// A top-level function rather than an inline closure so it is testable
/// without mounting the whole app — the app's home screen needs a
/// ProviderScope and a network, none of which this decision depends on.
///
/// A device set to a language we do not ship gets English, NOT whichever
/// supported locale happens to sort first. Listing Arabic first is a
/// deliberate market choice; it must not become the fallback for a French
/// phone by accident.
Locale resolveLocale(Locale? deviceLocale, Iterable<Locale> supported) {
  if (deviceLocale == null) return const Locale('en');
  for (final candidate in supported) {
    if (candidate.languageCode == deviceLocale.languageCode) return candidate;
  }
  return const Locale('en');
}

class LastChanceApp extends StatelessWidget {
  const LastChanceApp({super.key, this.locale});

  /// Forces a locale. Null follows the device, which is what ships; tests and
  /// an in-app language toggle pass an explicit one.
  final Locale? locale;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (context) => LcStrings.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildDarkTheme(),

      // Text direction follows from this. GlobalWidgetsLocalizations maps an
      // Arabic locale to TextDirection.rtl for the whole subtree, so every
      // EdgeInsetsDirectional, Row and mirrored icon flips without a single
      // `if (isRtl)` in widget code.
      locale: locale,
      supportedLocales: LcStrings.supportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        LcStrings.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      localeResolutionCallback: resolveLocale,

      // The flash-deal feed is the guest home; the direct-booking flow is one
      // tap away (app-bar action) from there.
      home: const DealsScreen(),
    );
  }
}
