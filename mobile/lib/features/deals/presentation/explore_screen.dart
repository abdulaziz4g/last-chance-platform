import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';
import '../../../app/widgets/brand_widgets.dart';
import '../../../app/widgets/listing_card.dart';
import '../../booking/domain/booking.dart';
import '../../map/application/map_search_controller.dart';
import '../../map/domain/map_pin.dart';
import '../../map/presentation/map_screen.dart';
import '../../map/presentation/search_sheet.dart';
import 'deals_screen.dart';

/// The app's home: search, categories, and everything bookable.
///
/// Folds in rather than replaces. The listings come from the SAME viewport
/// search the map runs, so a guest switching to the map sees exactly what the
/// grid showed — and the flash-deal feed is a section here instead of a screen
/// nobody navigates to. Nothing built for the map was thrown away; it moved.
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  BookingType? _category;

  /// Saved listings, in memory only — there is no wishlist API, so a heart
  /// survives a scroll and not a restart. Kept here rather than faked in the
  /// card so the card stays honest about being controlled.
  final Set<String> _saved = <String>{};

  void _openSearch() {
    final state = ref.read(mapSearchProvider);
    LcSearchSheet.show(
      context,
      initial: state.filters,
      onSearch: (request) {
        final notifier = ref.read(mapSearchProvider.notifier);
        notifier.applyFilters(request.filters);
        // A chosen destination moves the viewport, which is what actually
        // changes the results — "where" is a box, not a string.
        if (request.destination != null) {
          notifier.onBoundsChanged(request.destination!.bounds);
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final state = ref.watch(mapSearchProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => ref.read(mapSearchProvider.notifier).refresh(),
          child: CustomScrollView(
            slivers: <Widget>[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(
                    LcSpacing.screenPadding,
                    12,
                    LcSpacing.screenPadding,
                    0,
                  ),
                  child: Column(
                    children: <Widget>[
                      _SearchPill(
                        label: _searchLabel(context, state),
                        onTap: _openSearch,
                      ),
                      const SizedBox(height: LcSpacing.gridGap),
                      _CategoryRow(
                        selected: _category,
                        onSelected: (type) {
                          setState(() => _category = type);
                          if (type != null) {
                            ref
                                .read(mapSearchProvider.notifier)
                                .setBookingType(type);
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ),

              // Deals keep their own strip: a discounted stay is a different
              // proposition from a nightly rate and gets buried in a grid.
              const SliverToBoxAdapter(child: _DealsStrip()),

              SliverPadding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  LcSpacing.screenPadding,
                  LcSpacing.sectionGap,
                  LcSpacing.screenPadding,
                  8,
                ),
                sliver: SliverToBoxAdapter(
                  child: LcSectionTitle(
                    title: strings.topStayUnits,
                    onSeeAll: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const MapScreen(),
                      ),
                    ),
                  ),
                ),
              ),

              if (state.isLoading && state.pins.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (state.pins.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _EmptyExplore(strings: strings),
                )
              else
                SliverPadding(
                  padding: const EdgeInsetsDirectional.fromSTEB(
                    LcSpacing.screenPadding,
                    0,
                    LcSpacing.screenPadding,
                    LcSpacing.sectionGap,
                  ),
                  sliver: SliverLayoutBuilder(
                    builder: (context, constraints) {
                      // One column on a phone, two from tablet width. The
                      // breakpoint is on the CARD's comfortable width rather
                      // than a device class, so a large phone in landscape gets
                      // two as well.
                      final columns =
                          constraints.crossAxisExtent >= 640 ? 2 : 1;
                      return SliverGrid(
                        gridDelegate:
                            SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          crossAxisSpacing: LcSpacing.gridGap,
                          mainAxisSpacing: LcSpacing.sectionGap,
                          // Image at 16:10 plus three lines of caption.
                          childAspectRatio: columns == 1 ? 1.18 : 1.02,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => _pinCard(state.pins[i], strings),
                          childCount: state.pins.length,
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pinCard(MapPin pin, LcStrings strings) {
    return LcListingCard(
      title: pin.propertyName,
      subtitle: '${pin.unitName}${strings.listSeparator}${pin.city}',
      priceMinor: pin.priceMinor,
      currency: pin.currency,
      photos: pin.photos,
      rating: pin.ratingAvg,
      perUnitLabel: pin.bookingType == BookingType.hourly
          ? strings.perHour
          : strings.perNight,
      badge: pin.hasDeal ? strings.discountBadge(pin.deal!.discountPct) : null,
      saved: _saved.contains(pin.unitId),
      onSavedChanged: (value) => setState(
        () => value ? _saved.add(pin.unitId) : _saved.remove(pin.unitId),
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const MapScreen()),
      ),
    );
  }

  String _searchLabel(BuildContext context, MapSearchState state) {
    final strings = LcStrings.of(context);
    if (state.filters.isEmpty) return strings.startYourSearch;
    // Once something is set the pill reports it, so the guest can see their
    // search without reopening the sheet.
    final parts = <String>[
      if (state.filters.hasDateRange)
        MaterialLocalizations.of(context)
            .formatShortMonthDay(state.filters.checkInUtc!),
      if (state.filters.guests != null)
        strings.guestsCount(state.filters.guests!),
    ];
    return parts.isEmpty ? strings.filters : parts.join(strings.listSeparator);
  }
}

/// The rounded search bar that opens the sheet.
class _SearchPill extends StatelessWidget {
  const _SearchPill({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: LcBrand.white,
      borderRadius: LcRadius.pillBorder,
      child: InkWell(
        borderRadius: LcRadius.pillBorder,
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            color: LcBrand.white,
            borderRadius: LcRadius.pillBorder,
            boxShadow: LcShadow.card,
          ),
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: 18,
            vertical: 15,
          ),
          child: Row(
            children: <Widget>[
              const Icon(Icons.search, size: 20, color: LcBrand.text),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: LcType.label),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Hotels / Units / Sea View, as the package's category tiles.
class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.selected, required this.onSelected});

  final BookingType? selected;
  final ValueChanged<BookingType?> onSelected;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceAround,
      children: <Widget>[
        LcCategoryButton(
          icon: Icons.hotel_rounded,
          label: strings.hotels,
          active: selected == BookingType.nightly,
          onTap: () => onSelected(BookingType.nightly),
        ),
        LcCategoryButton(
          icon: Icons.apartment_rounded,
          label: strings.stayUnits,
          active: selected == BookingType.hourly,
          onTap: () => onSelected(BookingType.hourly),
        ),
        LcCategoryButton(
          icon: Icons.waves_rounded,
          label: strings.seaView,
          // Sea View is not a booking type the API knows, so it is inert
          // rather than wired to a filter that would silently do nothing.
          active: false,
          onTap: null,
        ),
      ],
    );
  }
}

/// The flash-deal feed, as a horizontal strip inside Explore.
class _DealsStrip extends StatelessWidget {
  const _DealsStrip();

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return Padding(
      padding: const EdgeInsetsDirectional.only(top: LcSpacing.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: LcSpacing.screenPadding,
            ),
            child: LcSectionTitle(
              title: strings.flashDeals,
              onSeeAll: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const DealsScreen()),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyExplore extends StatelessWidget {
  const _EmptyExplore({required this.strings});

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
            const Icon(Icons.search_off, size: 44, color: LcBrand.sand),
            const SizedBox(height: LcSpacing.gridGap),
            Text(strings.noStays, style: theme.textTheme.titleMedium),
          ],
        ),
      ),
    );
  }
}
