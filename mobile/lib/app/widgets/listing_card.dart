import 'package:flutter/material.dart';

import '../../core/money.dart';
import '../design_tokens.dart';
import '../l10n.dart';

/// A listing tile: swipeable imagery, a save toggle, and the line of facts a
/// guest scans before tapping.
///
/// Takes primitives rather than a domain object. Explore feeds it live map
/// results and Wishlists feeds it saved entries; binding it to either model
/// would force the other to construct a fake one.
///
/// Every measurement is a token. The card is the most-copied widget in an app
/// of this shape, so a literal here becomes twenty literals by the end of the
/// month.
class LcListingCard extends StatefulWidget {
  const LcListingCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.priceMinor,
    required this.currency,
    this.photos = const <String>[],
    this.rating,
    this.perUnitLabel,
    this.saved = false,
    this.onSavedChanged,
    this.onTap,
    this.badge,
  });

  final String title;
  final String subtitle;

  /// Integer minor units. Formatted through [formatMinorCompact], so a Saudi
  /// guest sees SAR grouped and shaped for their locale.
  final int priceMinor;
  final String currency;

  final List<String> photos;
  final double? rating;

  /// "/ night" or "/ guest", already localized by the caller.
  final String? perUnitLabel;

  final bool saved;
  final ValueChanged<bool>? onSavedChanged;
  final VoidCallback? onTap;

  /// Optional corner flag — a live discount, for instance.
  final String? badge;

  @override
  State<LcListingCard> createState() => _LcListingCardState();
}

class _LcListingCardState extends State<LcListingCard> {
  final PageController _pages = PageController();
  int _page = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();

    return Semantics(
      button: widget.onTap != null,
      label: '${widget.title}, ${widget.subtitle}',
      child: InkWell(
        borderRadius: LcRadius.cardBorder,
        onTap: widget.onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            // The package's listing ratio, so a row of cards lines up even when
            // the photos behind them do not.
            AspectRatio(
              aspectRatio: LcSize.listingAspectRatio,
              child: ClipRRect(
                borderRadius: LcRadius.cardBorder,
                child: Stack(
                  fit: StackFit.expand,
                  children: <Widget>[
                    _Carousel(
                      photos: widget.photos,
                      controller: _pages,
                      onPageChanged: (i) => setState(() => _page = i),
                    ),
                    if (widget.photos.length > 1)
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 10,
                        child: _Dots(
                          count: widget.photos.length,
                          active: _page,
                        ),
                      ),
                    PositionedDirectional(
                      top: 8,
                      end: 8,
                      child: _SaveButton(
                        saved: widget.saved,
                        onChanged: widget.onSavedChanged,
                      ),
                    ),
                    if (widget.badge != null)
                      PositionedDirectional(
                        top: 10,
                        start: 10,
                        child: _Badge(label: widget.badge!),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),

            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    widget.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: LcType.button),
                  ),
                ),
                if (widget.rating != null) ...<Widget>[
                  const SizedBox(width: 6),
                  const Icon(Icons.star_rounded, size: 15, color: LcBrand.star),
                  const SizedBox(width: 2),
                  Text(
                    widget.rating!.toStringAsFixed(1),
                    style: theme.textTheme.labelMedium
                        ?.copyWith(fontWeight: LcType.button),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 2),
            Text(
              widget.subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(color: LcBrand.muted),
            ),
            const SizedBox(height: 6),
            // Both parts shrink: Arabic renders the same figures wider, so a
            // row sized to fit English alone overflows the first time it is
            // seen in Arabic.
            Row(
              children: <Widget>[
                Flexible(
                  child: Text(
                    formatMinorCompact(
                      widget.priceMinor,
                      widget.currency,
                      locale: locale,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: LcType.figure),
                  ),
                ),
                if (widget.perUnitLabel != null)
                  Flexible(
                    child: Text(
                      ' ${widget.perUnitLabel!}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: LcBrand.muted),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Carousel extends StatelessWidget {
  const _Carousel({
    required this.photos,
    required this.controller,
    required this.onPageChanged,
  });

  final List<String> photos;
  final PageController controller;
  final ValueChanged<int> onPageChanged;

  @override
  Widget build(BuildContext context) {
    if (photos.isEmpty) return const _PhotoPlaceholder();

    return PageView.builder(
      controller: controller,
      onPageChanged: onPageChanged,
      itemCount: photos.length,
      itemBuilder: (context, i) => Image.network(
        photos[i],
        fit: BoxFit.cover,
        // A listing whose photo 404s should still be a listing, not a red box.
        errorBuilder: (_, __, ___) => const _PhotoPlaceholder(),
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : const _PhotoPlaceholder(),
      ),
    );
  }
}

/// Sand with the doorway glyph — the monogram's own motif.
///
/// Hosts list before they photograph, so this is a normal state rather than an
/// error one, and it should look deliberate.
class _PhotoPlaceholder extends StatelessWidget {
  const _PhotoPlaceholder();

  @override
  Widget build(BuildContext context) => const ColoredBox(
        color: LcBrand.sand,
        child: Center(
          child: Icon(
            Icons.door_front_door_outlined,
            color: LcBrand.muted,
            size: 34,
          ),
        ),
      );
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.active});

  final int count;
  final int active;

  /// Beyond this the dots stop being countable and start being texture.
  static const int _maxDots = 5;

  @override
  Widget build(BuildContext context) {
    final shown = count.clamp(0, _maxDots);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        for (var i = 0; i < shown; i++)
          Container(
            width: 6,
            height: 6,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              // White over photography, dimmed when inactive: the imagery
              // underneath is unknown, so the dots cannot rely on contrast
              // with a brand colour.
              color: Colors.white.withValues(alpha: i == active ? 1 : 0.55),
            ),
          ),
      ],
    );
  }
}

class _SaveButton extends StatelessWidget {
  const _SaveButton({required this.saved, this.onChanged});

  final bool saved;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return Semantics(
      button: true,
      toggled: saved,
      label: saved ? strings.removeFromWishlist : strings.addToWishlist,
      child: InkResponse(
        onTap: onChanged == null ? null : () => onChanged!(!saved),
        radius: 22,
        child: Icon(
          saved ? Icons.favorite : Icons.favorite_border,
          // Coral when saved; white with a shadow when not, because it sits on
          // a photograph whose colour cannot be predicted.
          color: saved ? LcBrand.coral : Colors.white,
          size: 26,
          shadows: const <Shadow>[
            Shadow(color: Color(0x552B1F1A), blurRadius: 6),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: LcBrand.white,
          borderRadius: BorderRadius.all(Radius.circular(LcRadius.pill)),
        ),
        child: Padding(
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: 10,
            vertical: 4,
          ),
          child: Text(
            label,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(fontWeight: LcType.figure, color: LcBrand.text),
          ),
        ),
      );
}
