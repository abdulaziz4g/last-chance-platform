import 'package:flutter/material.dart';

/// Brand tokens from the Last Chance Design & Developer Package.
///
/// THE package is the source of truth; this file is its transcription and the
/// only place these values exist. Its closing instruction is explicit: "Keep
/// all brand tokens centralized. Do not hard-code random colors or radii
/// inside screens." A literal in a widget is a bug here, not a shortcut.
///
/// Where the spec gives a RANGE, both ends are recorded next to the chosen
/// value. A reader changing `cardRadius` needs to know 22 was picked from
/// 18–24 rather than invented, and that 26 would be out of spec.
abstract final class LcBrand {
  // ---- colour system (package §1) -----------------------------------------

  /// Buttons, active icons, highlights, logo.
  static const Color coral = Color(0xFFFF5A4A);

  /// Main app background and soft sections.
  static const Color background = Color(0xFFFFF4EE);

  /// Cards, secondary surfaces, icon backgrounds.
  static const Color sand = Color(0xFFF2E7DF);

  /// Headings, body text, premium contrast.
  static const Color text = Color(0xFF2B1F1A);

  /// Secondary text, metadata, labels.
  ///
  /// #7B6B63 per the package — both the §1 colour table and the §4 brand-token
  /// block agree. (A hand-written summary circulated as #786863; the package
  /// wins.)
  static const Color muted = Color(0xFF7B6B63);

  /// Cards, sheets, inputs.
  static const Color white = Color(0xFFFFFFFF);

  /// Rating stars. Not in the colour table — taken from the package's own
  /// starter code, which uses it for every star glyph.
  static const Color star = Color(0xFFFFB547);
}

/// Status colours — NOT from the design package.
///
/// The package specifies no error or success colour, but the app has states
/// that must not be painted in coral: a hold expiring or a payment failing
/// rendered in the brand's call-to-action colour reads as an invitation. These
/// are chosen to sit beside the warm palette rather than fight it, and are
/// segregated here so it stays obvious which values the package authored and
/// which this app had to supply.
abstract final class LcStatus {
  static const Color danger = Color(0xFFB3261E);
  static const Color success = Color(0xFF2E7D5B);
}

/// Component measurements (package §2).
abstract final class LcSpacing {
  /// Spec 20–24 px. The package's starter uses 20 throughout.
  static const double screenPadding = 20;

  /// Spec 24–32 px, between major sections.
  static const double sectionGap = 28;

  /// Spec 12–16 px, between items in a row or grid.
  static const double gridGap = 14;
}

/// Corner radii (package §2).
abstract final class LcRadius {
  /// Spec 18–24 px. The starter uses 22 for property cards.
  static const double card = 22;

  /// Spec is exact, not a range.
  static const double input = 16;

  /// Not separately specified; the starter uses 18 on the primary button and
  /// on the category tile, which is inside the 18–24 card band.
  static const double button = 18;

  /// Pill — chips, badges, the map's price pins.
  static const double pill = 999;

  /// App icon radius is 22–26% OF THE ICON SIZE, not an absolute value, so it
  /// is a fraction: a 512 px icon gets ~123 px, a 48 px icon gets ~11.5 px.
  static const double appIconFraction = 0.24;

  static BorderRadius get cardBorder => BorderRadius.circular(card);
  static BorderRadius get inputBorder => BorderRadius.circular(input);
  static BorderRadius get buttonBorder => BorderRadius.circular(button);
  static BorderRadius get pillBorder => BorderRadius.circular(pill);
}

/// Fixed component sizes (package §2).
abstract final class LcSize {
  /// Spec 52–56 px. The starter uses 54.
  static const double primaryButtonHeight = 54;

  /// Spec 72–82 px.
  static const double bottomNavHeight = 76;

  /// The square category tile from the starter (Hotels / Units / Sea View).
  static const double categoryTile = 54;

  /// Listing card imagery.
  static const double listingAspectRatio = 16 / 10;

  /// Promotional card imagery.
  static const double promoAspectRatio = 4 / 5;
}

/// Elevation (package §2).
abstract final class LcShadow {
  /// `0 10 30 rgba(43,31,26,0.08)` — the one card shadow in the package.
  ///
  /// Written from the spec rather than copied from the starter code, whose two
  /// card widgets drifted to blur 24 and 28 at 7–8% alpha. One shadow, applied
  /// everywhere, is what makes a surface read as the same material.
  static const List<BoxShadow> card = <BoxShadow>[
    BoxShadow(
      color: Color(0x142B1F1A), // #2B1F1A at 8% (0x14 = 20/255)
      blurRadius: 30,
      offset: Offset(0, 10),
    ),
  ];
}

/// Type families and weights (package §1).
///
/// Three families, chosen by ROLE, not by locale — except Arabic, which
/// replaces both Latin families because Cormorant and Poppins have no Arabic
/// glyphs at all. Rendering Arabic in a Latin-only family does not fall back
/// gracefully; it produces tofu or a silently substituted system face, which
/// is how a bilingual app ends up looking unfinished in one of its languages.
abstract final class LcType {
  /// Logo and editorial headings. Package: Cormorant Garamond or Playfair.
  static const String display = 'Cormorant Garamond';

  /// Application UI. Package: Poppins, Manrope, or Inter.
  static const String ui = 'Poppins';

  /// Arabic. Package: IBM Plex Sans Arabic, Noto Sans Arabic, or Tajawal.
  static const String arabic = 'Tajawal';

  // Recommended weights, named so a screen asks for the ROLE and cannot
  // quietly pick w300 because it looked nicer on one label.
  static const FontWeight body = FontWeight.w400;
  static const FontWeight label = FontWeight.w500;
  static const FontWeight button = FontWeight.w600;

  /// Key numbers — prices, ratings, counts.
  static const FontWeight figure = FontWeight.w700;
}
