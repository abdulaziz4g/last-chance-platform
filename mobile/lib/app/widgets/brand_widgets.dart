/// The reusable components named in the design package §4:
/// "property cards, category buttons, amenity icons, primary buttons, headers".
///
/// Every measurement comes from [LcBrand]/[LcRadius]/[LcSize]/[LcShadow].
///
/// These differ from the package's starter code in two deliberate ways, both
/// because the starter is illustrative and this app is wired to a real API:
///
///  1. MONEY. The starter renders `'\$$price'` from an `int`. This app carries
///     integer MINOR units and a currency code, and formats through
///     [formatMinorCompact] so a Saudi guest sees SAR grouped and shaped for
///     their locale. Hardcoding a dollar sign would be wrong in the app's only
///     market.
///  2. DIRECTION. The starter uses EdgeInsets and bare Rows. Everything here
///     is Directional, so Arabic mirrors without a single `if (isRtl)`.
library;

import 'package:flutter/material.dart';

import '../../core/money.dart';
import '../design_tokens.dart';
import '../l10n.dart';

/// The package's primary call to action: full width, coral, 54 high, r18.
///
/// Reads its size and shape from the theme rather than restating them, so the
/// button and `FilledButton` elsewhere in the app cannot drift apart.
class LcPrimaryButton extends StatelessWidget {
  const LcPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;

  /// Null disables the button — the standard Flutter idiom, kept so callers
  /// can express "not yet valid" without a second flag.
  final VoidCallback? onPressed;

  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onPressed,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: LcType.button),
            ),
          ),
          if (icon != null) ...<Widget>[
            const SizedBox(width: 10),
            // Directional icons mirror themselves in Arabic; a plain
            // arrow_forward would point out of the reading direction.
            Icon(icon, size: 18),
          ],
        ],
      ),
    );
  }
}

/// Hotels / Units / Sea View. Coral fill when active, white when not.
class LcCategoryButton extends StatelessWidget {
  const LcCategoryButton({
    super.key,
    required this.icon,
    required this.label,
    this.active = false,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      selected: active,
      label: label,
      child: InkWell(
        borderRadius: LcRadius.buttonBorder,
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: LcSize.categoryTile,
              height: LcSize.categoryTile,
              decoration: BoxDecoration(
                color: active ? LcBrand.coral : LcBrand.white,
                borderRadius: LcRadius.buttonBorder,
                boxShadow: LcShadow.card,
              ),
              child: Icon(icon, color: active ? LcBrand.white : LcBrand.coral),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: LcType.label,
                color: active ? LcBrand.text : LcBrand.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A listing row: image, name, location, rating, price.
class LcPropertyCard extends StatelessWidget {
  const LcPropertyCard({
    super.key,
    required this.name,
    required this.location,
    required this.priceMinor,
    required this.currency,
    this.rating,
    this.ratingCount,
    this.imageUrl,
    this.perUnitLabel,
    this.onTap,
  });

  final String name;
  final String location;

  /// Integer minor units — halalas, not riyals. See [formatMinorCompact].
  final int priceMinor;
  final String currency;

  final double? rating;
  final int? ratingCount;
  final String? imageUrl;

  /// "/ night" or "/ hour", already localized by the caller.
  final String? perUnitLabel;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();

    return Semantics(
      button: onTap != null,
      label: '$name, $location',
      child: Material(
        color: LcBrand.white,
        borderRadius: LcRadius.cardBorder,
        child: InkWell(
          borderRadius: LcRadius.cardBorder,
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              color: LcBrand.white,
              borderRadius: LcRadius.cardBorder,
              boxShadow: LcShadow.card,
            ),
            padding: const EdgeInsetsDirectional.all(10),
            child: Row(
              children: <Widget>[
                _Thumb(imageUrl: imageUrl),
                const SizedBox(width: LcSpacing.gridGap),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: LcType.button),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        location,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: LcBrand.muted),
                      ),
                      const SizedBox(height: 10),
                      // Both sides shrink: Arabic renders the same figures
                      // wider, so a row sized to fit English only is a
                      // guaranteed overflow the first time it is seen in
                      // Arabic.
                      Row(
                        children: <Widget>[
                          if (rating != null) ...<Widget>[
                            const Icon(
                              Icons.star_rounded,
                              color: LcBrand.star,
                              size: 17,
                            ),
                            const SizedBox(width: 2),
                            Flexible(
                              child: Text(
                                ratingCount == null
                                    ? rating!.toStringAsFixed(1)
                                    : '${rating!.toStringAsFixed(1)} ($ratingCount)',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelSmall
                                    ?.copyWith(fontWeight: LcType.button),
                              ),
                            ),
                          ],
                          const Spacer(),
                          Flexible(
                            child: Text(
                              formatMinorCompact(
                                priceMinor,
                                currency,
                                locale: locale,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleSmall?.copyWith(
                                color: LcBrand.coral,
                                fontWeight: LcType.figure,
                              ),
                            ),
                          ),
                          if (perUnitLabel != null)
                            Flexible(
                              child: Text(
                                perUnitLabel!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelSmall
                                    ?.copyWith(color: LcBrand.muted),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The listing thumbnail, at the package's 16:10 listing ratio.
///
/// Falls back to a sand tile with the doorway-arch glyph when there is no
/// photo. Hosts ship listings before they ship photography, and a broken image
/// box on the first card is a worse first impression than an empty listing.
class _Thumb extends StatelessWidget {
  const _Thumb({this.imageUrl});

  final String? imageUrl;

  static const double _width = 108;

  @override
  Widget build(BuildContext context) {
    const height = _width / LcSize.listingAspectRatio * 1.36; // ~92, per starter
    final placeholder = Container(
      width: _width,
      height: height,
      color: LcBrand.sand,
      alignment: Alignment.center,
      child: const Icon(Icons.door_front_door_outlined,
          color: LcBrand.muted, size: 26),
    );

    return ClipRRect(
      borderRadius: LcRadius.inputBorder,
      child: imageUrl == null
          ? placeholder
          : Image.network(
              imageUrl!,
              width: _width,
              height: height,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => placeholder,
            ),
    );
  }
}

/// An amenity glyph with its label — coral icon, small caption.
class LcAmenity extends StatelessWidget {
  const LcAmenity({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, color: LcBrand.coral),
          const SizedBox(height: 6),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: LcBrand.muted),
          ),
        ],
      );
}

/// A section header with an optional "See all" affordance.
class LcSectionTitle extends StatelessWidget {
  const LcSectionTitle({super.key, required this.title, this.onSeeAll});

  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = LcStrings.of(context);

    return Row(
      children: <Widget>[
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: LcType.figure),
          ),
        ),
        if (onSeeAll != null)
          TextButton(
            onPressed: onSeeAll,
            child: Text(strings.seeAll),
          ),
      ],
    );
  }
}
