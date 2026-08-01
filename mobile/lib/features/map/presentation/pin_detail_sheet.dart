import 'package:flutter/material.dart';

import '../../../app/l10n.dart';
import '../../../core/money.dart';
import '../../booking/domain/booking.dart';
import '../domain/map_pin.dart';

/// The sheet shown when a pin is selected.
///
/// Typed on [MapPin] rather than `dynamic`: the whole point of the domain
/// layer is that a screen cannot ask for a field the contract does not have,
/// and `dynamic` throws that away for the one widget most likely to be edited
/// by someone unfamiliar with the API.
///
/// Nothing here branches on text direction. Padding is Directional, the Row
/// lays out from the locale, and the disclosure icon mirrors itself — so
/// Arabic works because the widgets are direction-aware, not because a
/// conditional caught every case.
class PinDetailSheet extends StatelessWidget {
  const PinDetailSheet({
    super.key,
    required this.pin,
    this.onOpen,
    this.onDismiss,
  });

  final MapPin pin;
  final VoidCallback? onOpen;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final perUnit = pin.bookingType == BookingType.hourly
        ? strings.perHour
        : strings.perNight;

    return Semantics(
      container: true,
      label: '${pin.propertyName}, ${pin.unitName}',
      child: Material(
        // From the theme, never a hardcoded Colors.white: this app ships a
        // dark theme, so a white sheet would be an unreadable slab of glare.
        color: theme.colorScheme.surfaceContainer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        clipBehavior: Clip.antiAlias,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: theme.dividerColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                Row(
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            pin.propertyName,
                            style: theme.textTheme.titleMedium,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            '${pin.unitName} · ${pin.city}'
                            '${pin.district == null ? '' : '${strings.listSeparator}${pin.district}'}',
                            style: theme.textTheme.bodySmall,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    if (pin.hasDeal)
                      Container(
                        padding: const EdgeInsetsDirectional.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD4A359),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          strings.discountBadge(pin.deal!.discountPct),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: const Color(0xFF1E232A),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: <Widget>[
                    // Only struck through when the price really is lower —
                    // a crossed-out figure identical to the one beside it
                    // reads as a rendering bug, not a saving.
                    if (pin.showsDiscount) ...<Widget>[
                      Text(
                        formatMinorCompact(
                          pin.basePriceMinor,
                          pin.currency,
                          locale: locale,
                        ),
                        style: theme.textTheme.bodySmall?.copyWith(
                          decoration: TextDecoration.lineThrough,
                          color: theme.disabledColor,
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Text(
                      formatMinorCompact(
                        pin.priceMinor,
                        pin.currency,
                        locale: locale,
                      ),
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(perUnit, style: theme.textTheme.bodySmall),
                    if (pin.ratingAvg != null) ...<Widget>[
                      const Spacer(),
                      Text(
                        '★ ${pin.ratingAvg!.toStringAsFixed(2)} (${pin.ratingCount})',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),

                // The privacy disclosure travels with the pin, not the map, so
                // a guest reading only the sheet still learns why the marker is
                // vague and when that stops being true.
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Icon(
                      Icons.privacy_tip_outlined,
                      size: 16,
                      color: theme.textTheme.bodySmall?.color,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        strings.approximateArea(pin.privacyRadiusMetres),
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                Row(
                  children: <Widget>[
                    if (onDismiss != null)
                      TextButton(
                        onPressed: onDismiss,
                        child: Text(MaterialLocalizations.of(context)
                            .closeButtonLabel),
                      ),
                    const Spacer(),
                    FilledButton.icon(
                      onPressed: onOpen,
                      // Icons.arrow_forward carries matchTextDirection on its
                      // IconData, so it mirrors in Arabic on its own. That is
                      // the point of preferring a directional icon over an
                      // `isRtl ? chevron_left : chevron_right` conditional —
                      // the next icon someone adds gets it right by default.
                      icon: const Icon(Icons.arrow_forward),
                      label: Text(strings.viewDetails),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
