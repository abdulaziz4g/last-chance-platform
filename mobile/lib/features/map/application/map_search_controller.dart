import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../booking/domain/booking.dart';
import '../data/map_repository.dart';
import '../domain/map_filters.dart';
import '../domain/map_pin.dart';

/// Which pane the phone is showing. Desktop shows both; a phone cannot.
enum MapViewMode { map, list }

/// The AlUla valley — wide enough to take in Old Town, the Hegra approach and
/// Jabal AlFil at once, so the first frame has inventory in it rather than
/// requiring a pan before anything appears.
const MapBounds kDefaultBounds = MapBounds(
  minLng: 37.85,
  minLat: 26.55,
  maxLng: 38.08,
  maxLat: 26.83,
);

/// A pan emits a bounds change per frame; only the last one is worth a request.
const Duration kSearchDebounce = Duration(milliseconds: 400);

/// How much larger than the viewport to fetch, so a short drag is served from
/// what is already in hand instead of a round-trip.
const double kPrefetchFactor = 1.4;

class MapSearchState {
  const MapSearchState({
    required this.bounds,
    required this.bookingType,
    required this.pins,
    required this.clusters,
    required this.truncated,
    required this.isLoading,
    this.selectedUnitId,
    this.error,
    this.viewMode = MapViewMode.map,
    this.filters = MapFilters.none,
  });

  factory MapSearchState.initial() => const MapSearchState(
        bounds: kDefaultBounds,
        bookingType: BookingType.nightly,
        pins: <MapPin>[],
        clusters: <MapPinCluster>[],
        truncated: false,
        isLoading: true,
      );

  final MapBounds bounds;
  final BookingType bookingType;
  final List<MapPin> pins;

  /// Pins grouped by shared coordinate. Derived once here rather than in the
  /// widget, so a rebuild does not regroup on every frame of a pan.
  final List<MapPinCluster> clusters;

  final bool truncated;
  final bool isLoading;
  final String? selectedUnitId;
  final ApiException? error;
  final MapViewMode viewMode;
  final MapFilters filters;

  MapPin? get selectedPin {
    final id = selectedUnitId;
    if (id == null) return null;
    for (final pin in pins) {
      if (pin.unitId == id) return pin;
    }
    return null;
  }

  bool get isEmpty => !isLoading && pins.isEmpty && error == null;

  MapSearchState copyWith({
    MapBounds? bounds,
    BookingType? bookingType,
    List<MapPin>? pins,
    List<MapPinCluster>? clusters,
    bool? truncated,
    bool? isLoading,
    MapViewMode? viewMode,
    MapFilters? filters,
    // Explicit clear flags: copyWith cannot distinguish "leave it" from "set
    // it to null" with nullable parameters alone.
    bool clearSelection = false,
    String? selectedUnitId,
    bool clearError = false,
    ApiException? error,
  }) {
    return MapSearchState(
      bounds: bounds ?? this.bounds,
      bookingType: bookingType ?? this.bookingType,
      pins: pins ?? this.pins,
      clusters: clusters ?? this.clusters,
      truncated: truncated ?? this.truncated,
      isLoading: isLoading ?? this.isLoading,
      selectedUnitId:
          clearSelection ? null : (selectedUnitId ?? this.selectedUnitId),
      error: clearError ? null : (error ?? this.error),
      viewMode: viewMode ?? this.viewMode,
      filters: filters ?? this.filters,
    );
  }
}

/// Drives the map screen.
///
/// Three behaviours here exist because the naive version is visibly wrong on a
/// real device:
///
///  1. DEBOUNCE — a pan emits bounds continuously; without it every frame is
///     an HTTP request.
///  2. CANCELLATION — even debounced, two searches can overlap, and the slower
///     response arriving second would paint stale pins over the current view.
///     Each new search cancels the last, and the resulting ApiException is
///     swallowed because we caused it.
///  3. PREFETCH MARGIN — results are fetched for a box larger than the
///     viewport, so a small drag inside what we already have skips the network
///     entirely. Without it, nudging the map one finger-width flickers the
///     whole pin layer.
class MapSearchController extends AutoDisposeNotifier<MapSearchState> {
  Timer? _debounce;
  CancelToken? _inFlight;

  /// The box the current results were fetched for — larger than the viewport.
  MapBounds? _fetchedBounds;

  @override
  MapSearchState build() {
    ref.onDispose(() {
      _debounce?.cancel();
      _inFlight?.cancel();
    });
    // Kick off the first search without blocking the first frame.
    scheduleMicrotask(() => _search(kDefaultBounds, force: true));
    return MapSearchState.initial();
  }

  /// Called by the map widget on every camera move.
  void onBoundsChanged(MapBounds bounds) {
    state = state.copyWith(bounds: bounds);

    final fetched = _fetchedBounds;
    if (fetched != null && fetched.containsBounds(bounds)) {
      // Already covered by the prefetch margin — nothing to do.
      return;
    }

    _debounce?.cancel();
    _debounce = Timer(kSearchDebounce, () => _search(bounds));
  }

  void setBookingType(BookingType type) {
    if (type == state.bookingType) return;
    state = state.copyWith(bookingType: type);
    // Prices and availability both change with the mode, so this is never
    // servable from what we already fetched.
    _search(state.bounds, force: true);
  }

  /// Commits a whole draft from the filter overlay in ONE search.
  ///
  /// The overlay edits its own copy and calls this once on Apply. Setting each
  /// field through its own action instead would fire a search per field and
  /// leave the map repainting behind the sheet while the guest is still
  /// choosing.
  void applyFilters(MapFilters filters) {
    // Opening the sheet and applying what was already set is not a new search.
    if (filters == state.filters) return;
    state = state.copyWith(filters: filters);
    _search(state.bounds, force: true);
  }

  void clearFilters() => applyFilters(MapFilters.none);

  void setDateRange(DateTime? checkInUtc, DateTime? checkOutUtc) {
    applyFilters(
      checkInUtc == null || checkOutUtc == null
          ? state.filters.copyWith(clearDates: true)
          : state.filters.copyWith(
              checkInUtc: checkInUtc,
              checkOutUtc: checkOutUtc,
            ),
    );
  }

  void setGuests(int? guests) {
    applyFilters(
      guests == null
          ? state.filters.copyWith(clearGuests: true)
          : state.filters.copyWith(guests: guests),
    );
  }

  void setPriceRange(int? minPriceMinor, int? maxPriceMinor) {
    applyFilters(
      state.filters.copyWith(
        minPriceMinor: minPriceMinor,
        maxPriceMinor: maxPriceMinor,
        clearMinPrice: minPriceMinor == null,
        clearMaxPrice: maxPriceMinor == null,
      ),
    );
  }

  void select(String? unitId) {
    if (unitId == null || unitId == state.selectedUnitId) {
      state = state.copyWith(clearSelection: true);
      return;
    }
    state = state.copyWith(selectedUnitId: unitId);
  }

  void toggleViewMode() {
    state = state.copyWith(
      viewMode:
          state.viewMode == MapViewMode.map ? MapViewMode.list : MapViewMode.map,
    );
  }

  Future<void> refresh() => _search(state.bounds, force: true);

  Future<void> _search(MapBounds viewport, {bool force = false}) async {
    if (!viewport.isSearchable) {
      // Nothing sensible to request; say so rather than firing a certain 400.
      state = state.copyWith(
        isLoading: false,
        error: const ApiException(
          code: 'VIEWPORT_TOO_LARGE',
          message: 'Zoom in to search this area.',
        ),
      );
      return;
    }

    final fetchBounds = viewport.inflated(kPrefetchFactor);
    // The inflated box can exceed the server's span cap even when the viewport
    // does not; fall back to the exact viewport rather than being rejected.
    final requestBounds =
        fetchBounds.isSearchable ? fetchBounds : viewport;

    _inFlight?.cancel();
    final token = CancelToken();
    _inFlight = token;

    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final result = await ref.read(mapRepositoryProvider).search(
            MapSearchQuery(
              bounds: requestBounds,
              bookingType: state.bookingType,
              checkInUtc: state.filters.checkInUtc,
              checkOutUtc: state.filters.checkOutUtc,
              guests: state.filters.guests,
              minPriceMinor: state.filters.minPriceMinor,
              maxPriceMinor: state.filters.maxPriceMinor,
            ),
            cancelToken: token,
          );

      if (token.isCancelled) return;
      _fetchedBounds = requestBounds;

      // A selection that is no longer in the results would leave the sheet
      // showing a stay the user can no longer see on the map.
      final stillVisible = result.pins.any(
        (p) => p.unitId == state.selectedUnitId,
      );

      state = state.copyWith(
        pins: result.pins,
        clusters: MapPinCluster.from(result.pins),
        truncated: result.truncated,
        isLoading: false,
        clearError: true,
        clearSelection: !stillVisible,
      );
    } on ApiException catch (e) {
      // We cancelled it; there is nothing for the user to see.
      if (e.isCancelled || token.isCancelled) return;
      state = state.copyWith(isLoading: false, error: e);
    }
  }
}

final mapSearchProvider =
    AutoDisposeNotifierProvider<MapSearchController, MapSearchState>(
  MapSearchController.new,
);
