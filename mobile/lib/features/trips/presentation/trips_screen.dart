import 'package:flutter/material.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';
import '../../../app/shell.dart';
import '../../../app/widgets/brand_widgets.dart';

/// Bookings as a timeline, split into upcoming and past.
///
/// Unlike Wishlists and Messages this is NOT mock in principle — bookings are
/// real and the API exists. It renders empty here because the guest session is
/// not wired into this shell yet, so the honest state is "no trips" rather than
/// invented ones. When the session lands, only the data source changes; the
/// timeline below is what it feeds.
class TripsScreen extends StatelessWidget {
  const TripsScreen({super.key, this.upcoming = const <TripEntry>[], this.past = const <TripEntry>[]});

  final List<TripEntry> upcoming;
  final List<TripEntry> past;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);
    final empty = upcoming.isEmpty && past.isEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.tabTrips, style: theme.textTheme.headlineSmall),
        toolbarHeight: 72,
      ),
      body: empty
          ? _EmptyTrips(strings: strings)
          : ListView(
              padding: const EdgeInsetsDirectional.fromSTEB(
                LcSpacing.screenPadding,
                8,
                LcSpacing.screenPadding,
                LcSpacing.sectionGap,
              ),
              children: <Widget>[
                if (upcoming.isNotEmpty) ...<Widget>[
                  LcSectionTitle(title: strings.upcoming),
                  const SizedBox(height: LcSpacing.gridGap),
                  for (final trip in upcoming) _TripRow(trip: trip),
                  const SizedBox(height: LcSpacing.sectionGap),
                ],
                if (past.isNotEmpty) ...<Widget>[
                  LcSectionTitle(title: strings.past),
                  const SizedBox(height: LcSpacing.gridGap),
                  for (final trip in past) _TripRow(trip: trip, dimmed: true),
                ],
              ],
            ),
    );
  }
}

/// One stay on the timeline. Deliberately a view model rather than the booking
/// domain object: the screen needs a title, a place and a window, and binding
/// it to the full booking would drag the payment state in with it.
@immutable
class TripEntry {
  const TripEntry({
    required this.id,
    required this.title,
    required this.location,
    required this.checkInUtc,
    required this.checkOutUtc,
    this.photo,
  });

  final String id;
  final String title;
  final String location;
  final DateTime checkInUtc;
  final DateTime checkOutUtc;
  final String? photo;
}

class _TripRow extends StatelessWidget {
  const _TripRow({required this.trip, this.dimmed = false});

  final TripEntry trip;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final material = MaterialLocalizations.of(context);
    final strings = LcStrings.of(context);

    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: LcSpacing.gridGap),
      child: Material(
        color: LcBrand.white,
        borderRadius: LcRadius.cardBorder,
        child: Ink(
          decoration: BoxDecoration(
            color: LcBrand.white,
            borderRadius: LcRadius.cardBorder,
            boxShadow: LcShadow.card,
          ),
          padding: const EdgeInsetsDirectional.all(12),
          child: Row(
            children: <Widget>[
              ClipRRect(
                borderRadius: LcRadius.inputBorder,
                child: SizedBox(
                  width: 76,
                  height: 76,
                  child: trip.photo == null
                      ? const ColoredBox(
                          color: LcBrand.sand,
                          child: Icon(Icons.door_front_door_outlined,
                              color: LcBrand.muted),
                        )
                      : Image.network(
                          trip.photo!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const ColoredBox(color: LcBrand.sand),
                        ),
                ),
              ),
              const SizedBox(width: LcSpacing.gridGap),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(
                      trip.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: LcType.button,
                        // Past trips recede rather than disappear.
                        color: dimmed ? LcBrand.muted : LcBrand.text,
                      ),
                    ),
                    Text(
                      trip.location,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: LcBrand.muted),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      // formatMediumDate localizes month names and digit
                      // shapes; a hand-rolled 'd MMM' would put an English
                      // month inside Arabic text.
                      '${material.formatMediumDate(trip.checkInUtc)}'
                      '${strings.listSeparator}'
                      '${material.formatMediumDate(trip.checkOutUtc)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelMedium,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyTrips extends StatelessWidget {
  const _EmptyTrips({required this.strings});

  final LcStrings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsetsDirectional.all(LcSpacing.screenPadding * 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.card_travel_outlined, size: 44, color: LcBrand.sand),
            const SizedBox(height: LcSpacing.gridGap),
            Text(strings.noTripsYet, style: theme.textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              strings.tripsEmptyBody,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: LcBrand.muted),
            ),
            const SizedBox(height: LcSpacing.sectionGap),
            // The empty state carries the way out, rather than leaving the
            // guest to work out that Explore is where trips come from.
            LcPrimaryButton(
              label: strings.buildATrip,
              icon: Icons.arrow_forward,
              // Sends the guest to Explore, because that is where a trip comes
              // from. Null outside the shell (a test, a deep link) rather than
              // reaching for a Navigator that is not there.
              onPressed: () =>
                  LcShellScope.maybeOf(context)?.goTo(LcSection.explore),
            ),
          ],
        ),
      ),
    );
  }
}
