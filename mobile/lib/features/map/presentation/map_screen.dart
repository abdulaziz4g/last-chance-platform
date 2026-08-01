import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/l10n.dart';
import '../../../core/money.dart';
import '../../booking/domain/booking.dart';
import '../application/map_search_controller.dart';
import '../domain/map_pin.dart';
import '../map_config.dart';
import 'filter_sheet.dart';
import 'map_projection.dart';
import 'pin_detail_sheet.dart';
import 'tile_layer.dart';

/// The currency to label the price filter with.
///
/// Read from what is actually in view rather than assumed to be SAR, so a
/// viewport in another market does not put the wrong unit on the guest's own
/// numbers. Falls back only when there is nothing to read.
String _currencyInView(MapSearchState state) =>
    state.pins.isEmpty ? 'SAR' : state.pins.first.currency;

/// The map explorer.
///
/// Markers are Flutter widgets positioned over the tile layer, not Mapbox
/// PointAnnotations. Annotations would mean rendering each price to a bitmap
/// and re-rendering on every currency, locale or theme change; widgets inherit
/// the theme, localize themselves, and are tappable with a real hit box. The
/// cost is that the projection must be ours — see MapProjection.
class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  MapCamera? _camera;
  Size _size = Size.zero;

  void _onCameraChanged(MapCamera camera) {
    setState(() => _camera = camera);
    if (_size == Size.zero) return;
    ref
        .read(mapSearchProvider.notifier)
        .onBoundsChanged(MapProjection.boundsFor(camera, _size));
  }

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final state = ref.watch(mapSearchProvider);
    final notifier = ref.read(mapSearchProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.mapTitle),
        actions: <Widget>[
          // In the app bar rather than over the map, so it is reachable from
          // the list view too — the filters narrow both panes, not just the
          // one with pins on it.
          IconButton(
            tooltip: strings.filters,
            onPressed: () => MapFilterSheet.show(
              context,
              initial: state.filters,
              currency: _currencyInView(state),
              onApply: notifier.applyFilters,
            ),
            icon: Badge.count(
              count: state.filters.activeCount,
              isLabelVisible: !state.filters.isEmpty,
              child: const Icon(Icons.tune),
            ),
          ),
          TextButton(
            onPressed: notifier.toggleViewMode,
            child: Text(
              state.viewMode == MapViewMode.map
                  ? strings.listView
                  : strings.mapView,
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: _ModeBar(state: state, notifier: notifier),
        ),
      ),
      body: state.viewMode == MapViewMode.list
          ? _ResultsList(state: state, notifier: notifier)
          : _MapPane(
              state: state,
              notifier: notifier,
              camera: _camera,
              onCameraChanged: _onCameraChanged,
              onSized: (size) => _size = size,
            ),
    );
  }
}

class _ModeBar extends StatelessWidget {
  const _ModeBar({required this.state, required this.notifier});

  final MapSearchState state;
  final MapSearchController notifier;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    // The segmented control alone. The result count used to sit beside it and
    // overflowed on a 390 px phone: SegmentedButton's intrinsic width already
    // consumed the row, so ANY sibling pushed past the edge, and Arabic labels
    // are wider again. The count now lives as a chip over the map, which is
    // also where the user is looking when it changes.
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 8),
      child: Center(
        child: SegmentedButton<BookingType>(
          segments: <ButtonSegment<BookingType>>[
            ButtonSegment<BookingType>(
              value: BookingType.nightly,
              label: Text(strings.nightly),
            ),
            ButtonSegment<BookingType>(
              value: BookingType.hourly,
              label: Text(strings.hourly),
            ),
          ],
          selected: <BookingType>{state.bookingType},
          onSelectionChanged: (selection) =>
              notifier.setBookingType(selection.first),
        ),
      ),
    );
  }
}

class _MapPane extends StatelessWidget {
  const _MapPane({
    required this.state,
    required this.notifier,
    required this.camera,
    required this.onCameraChanged,
    required this.onSized,
  });

  final MapSearchState state;
  final MapSearchController notifier;
  final MapCamera? camera;
  final ValueChanged<MapCamera> onCameraChanged;
  final ValueChanged<Size> onSized;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        onSized(size);
        final initial = MapProjection.cameraFor(kDefaultBounds, size);
        final active = camera ?? initial;

        return Stack(
          // Every child here is positioned, and a loose Stack with no
          // unpositioned child sizes itself to constraints.smallest — so the
          // sheet pinned to left:0/right:0 inherited a degenerate width and
          // its buttons were asked to be infinitely wide. Expand fills the
          // pane, which is what a map surface wants regardless.
          fit: StackFit.expand,
          children: <Widget>[
            Positioned.fill(
              child: MapTileLayer.forEnvironment(
                initialCamera: initial,
                onCameraChanged: onCameraChanged,
              ),
            ),

            // Privacy circle for the selection only. Drawing one per pin would
            // turn a busy viewport into overlapping discs that say nothing.
            if (state.selectedPin != null)
              _PrivacyCircle(pin: state.selectedPin!, camera: active, size: size),

            ..._markers(context, active, size),

            PositionedDirectional(
              top: 12,
              start: 12,
              // Bounded because the row sits in an expanded Stack with only a
              // start edge pinned: without a ceiling the count and the filter
              // chip together run off the end on a narrow phone, and Arabic
              // renders both wider.
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: size.width - 24),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Flexible(
                      child: _Chip(
                        label: state.isLoading
                            ? strings.searching
                            : state.truncated
                                ? '${strings.staysInView(state.pins.length)} — '
                                    '${strings.zoomForAll}'
                                : strings.staysInView(state.pins.length),
                      ),
                    ),
                    // Applied filters have to be visible on the map itself. A
                    // guest who set a price ceiling, panned away and came back
                    // to an empty valley would otherwise read it as "nothing
                    // here" rather than "nothing here under your ceiling".
                    if (!state.filters.isEmpty) ...<Widget>[
                      const SizedBox(width: 8),
                      Flexible(
                        child: _FilterChip(
                          label: strings.filtersActive(
                            state.filters.activeCount,
                          ),
                          onClear: notifier.clearFilters,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            if (state.error != null)
              PositionedDirectional(
                top: 12,
                start: 12,
                end: 12,
                child: _ErrorBanner(
                  message: state.error!.code == 'VIEWPORT_TOO_LARGE'
                      ? strings.zoomIn
                      : state.error!.message,
                  onRetry: notifier.refresh,
                  retryLabel: strings.retry,
                ),
              ),

            // left+right pins the width to the (now expanded) Stack. This only
            // works because of StackFit.expand above: with the default loose
            // fit and no unpositioned child, the Stack collapsed to
            // constraints.smallest and these inherited a degenerate width.
            if (state.selectedPin != null)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: PinDetailSheet(
                  pin: state.selectedPin!,
                  onDismiss: () => notifier.select(null),
                ),
              )
            else if (state.pins.isNotEmpty)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: _PreviewCarousel(state: state, notifier: notifier),
              ),
          ],
        );
      },
    );
  }

  List<Widget> _markers(BuildContext context, MapCamera camera, Size size) {
    final widgets = <Widget>[];
    for (final cluster in state.clusters) {
      final point = MapProjection.project(
        cluster.lng,
        cluster.lat,
        camera,
        size,
      );
      // Cull generously off-screen markers; a viewport-sized margin keeps a
      // pin from popping in at the edge mid-pan.
      if (point.dx < -120 ||
          point.dy < -120 ||
          point.dx > size.width + 120 ||
          point.dy > size.height + 120) {
        continue;
      }

      final selected = cluster.pins.any(
        (p) => p.unitId == state.selectedUnitId,
      );

      widgets.add(
        Positioned(
          left: point.dx,
          top: point.dy,
          // No fixed box: a price pin has to be as wide as its price, and
          // "from SAR 1,450" in Arabic is wider still. Clamping it to a
          // constant overflowed the moment a cluster showed a "from" price.
          // FractionalTranslation centres an intrinsically-sized child on the
          // point instead.
          child: FractionalTranslation(
            translation: const Offset(-0.5, -0.5),
            // Positioned(left:, top:) alone gives an unbounded width; a marker
            // must never be wider than the map it sits on.
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: size.width),
              child: _PricePin(
                cluster: cluster,
                selected: selected,
                onTap: () => _onClusterTap(context, cluster),
              ),
            ),
          ),
        ),
      );
    }
    return widgets;
  }

  void _onClusterTap(BuildContext context, MapPinCluster cluster) {
    if (!cluster.isMultiple) {
      notifier.select(cluster.pins.single.unitId);
      return;
    }
    // Several units share this point, so a tap cannot mean one of them.
    // Asking beats guessing.
    showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => _ClusterPicker(
        cluster: cluster,
        onPick: (unitId) {
          Navigator.of(sheetContext).pop();
          notifier.select(unitId);
        },
      ),
    );
  }
}

class _PricePin extends StatelessWidget {
  const _PricePin({
    required this.cluster,
    required this.selected,
    required this.onTap,
  });

  final MapPinCluster cluster;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final price = formatMinorCompact(
      cluster.fromPriceMinor,
      cluster.currency,
      locale: locale,
    );
    final label = cluster.isMultiple ? '${strings.from} $price' : price;

    // Selection outranks the deal styling: the user's own choice should be the
    // loudest thing on the map, not the marketing.
    final background = selected
        ? const Color(AlUlaPalette.slateDeep)
        : cluster.hasDeal
            ? const Color(AlUlaPalette.sandGold)
            : Colors.white;
    final foreground = selected ? Colors.white : const Color(AlUlaPalette.slateDeep);

    return Semantics(
      button: true,
      selected: selected,
      label: '${cluster.representative.propertyName}, $label'
          '${cluster.hasDeal ? ', ${strings.discountBadge(cluster.bestDiscountPct!)}' : ''}',
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(999),
        elevation: selected ? 6 : 3,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: 10,
              vertical: 6,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (cluster.hasDeal && !selected) ...<Widget>[
                  Icon(Icons.bolt, size: 13, color: foreground),
                  const SizedBox(width: 2),
                ],
                Text(
                  label,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
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

class _PrivacyCircle extends StatelessWidget {
  const _PrivacyCircle({
    required this.pin,
    required this.camera,
    required this.size,
  });

  final MapPin pin;
  final MapCamera camera;
  final Size size;

  @override
  Widget build(BuildContext context) {
    final centre = MapProjection.project(
      pin.approxLng,
      pin.approxLat,
      camera,
      size,
    );
    final mpp = MapProjection.metresPerPixel(pin.approxLat, camera.zoom);
    // Sized from the radius the API published and the ground resolution here,
    // so it always describes a true 500 m rather than a constant number of
    // pixels that would imply different precision at different zooms.
    final radiusPx = mpp > 0 ? pin.privacyRadiusMetres / mpp : 0.0;
    if (radiusPx < 4) return const SizedBox.shrink();

    return Positioned(
      left: centre.dx - radiusPx,
      top: centre.dy - radiusPx,
      width: radiusPx * 2,
      height: radiusPx * 2,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(AlUlaPalette.terracotta).withValues(alpha: 0.15),
            border: Border.all(
              color: const Color(AlUlaPalette.terracotta).withValues(alpha: 0.6),
              width: 2,
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewCarousel extends StatelessWidget {
  const _PreviewCarousel({required this.state, required this.notifier});

  final MapSearchState state;
  final MapSearchController notifier;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 116,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsetsDirectional.fromSTEB(12, 0, 12, 12),
        itemCount: state.pins.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final pin = state.pins[index];
          return _PreviewCard(
            pin: pin,
            selected: pin.unitId == state.selectedUnitId,
            onTap: () => notifier.select(pin.unitId),
          );
        },
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({
    required this.pin,
    required this.selected,
    required this.onTap,
  });

  final MapPin pin;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = LcStrings.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();

    return SizedBox(
      width: 220,
      child: Card(
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: selected
                ? const Color(AlUlaPalette.terracotta)
                : Colors.transparent,
            width: 2,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsetsDirectional.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  pin.propertyName,
                  style: theme.textTheme.titleSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  pin.unitName,
                  style: theme.textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                // A fixed gap, NOT a Spacer. This card is used in two places:
                // the fixed-height carousel and the vertical results list. A
                // Spacer needs a bounded main axis, so in the list — where
                // height is unbounded — it throws.
                const SizedBox(height: 8),
                // Both children shrink. Arabic renders longer than English for
                // the same figures, so a row sized to fit English only is a
                // guaranteed overflow the first time it is seen in Arabic.
                Row(
                  children: <Widget>[
                    Flexible(
                      child: Text(
                        formatMinorCompact(
                          pin.priceMinor,
                          pin.currency,
                          locale: locale,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (pin.hasDeal) ...<Widget>[
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          strings.discountBadge(pin.deal!.discountPct),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: const Color(AlUlaPalette.sandGold),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
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

class _ClusterPicker extends StatelessWidget {
  const _ClusterPicker({required this.cluster, required this.onPick});

  final MapPinCluster cluster;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Padding(
            padding: const EdgeInsetsDirectional.all(16),
            child: Text(
              strings.unitsAtProperty(cluster.pins.length),
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ),
          ...cluster.pins.map(
            (pin) => ListTile(
              title: Text(pin.unitName),
              subtitle: Text(pin.propertyName),
              trailing: Text(
                formatMinorCompact(
                  pin.priceMinor,
                  pin.currency,
                  locale: locale,
                ),
              ),
              onTap: () => onPick(pin.unitId),
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultsList extends StatelessWidget {
  const _ResultsList({required this.state, required this.notifier});

  final MapSearchState state;
  final MapSearchController notifier;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    if (state.isEmpty) {
      return Center(child: Text(strings.noStays));
    }
    return ListView.builder(
      itemCount: state.pins.length,
      itemBuilder: (context, index) {
        final pin = state.pins[index];
        return _PreviewCard(
          pin: pin,
          selected: pin.unitId == state.selectedUnitId,
          onTap: () => notifier.select(pin.unitId),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Material(
        color: const Color(AlUlaPalette.slateDeep),
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: 10,
            vertical: 5,
          ),
          child: Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 11),
          ),
        ),
      );
}

/// The active-filter chip. Tapping it clears, so the escape from an
/// over-filtered map is on the map, not three taps into a sheet.
class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.onClear});

  final String label;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return Semantics(
      button: true,
      label: '$label, ${strings.clearAll}',
      child: Material(
        color: const Color(AlUlaPalette.terracotta),
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onClear,
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(10, 5, 8, 5),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontSize: 11),
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.close, size: 13, color: Colors.white),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({
    required this.message,
    required this.onRetry,
    required this.retryLabel,
  });

  final String message;
  final VoidCallback onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) => Material(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 8, 8),
          child: Row(
            children: <Widget>[
              Expanded(child: Text(message)),
              TextButton(onPressed: onRetry, child: Text(retryLabel)),
            ],
          ),
        ),
      );
}
