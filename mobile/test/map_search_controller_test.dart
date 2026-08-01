import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/core/api/api_exception.dart';
import 'package:lastchance_mobile/features/booking/domain/booking.dart';
import 'package:lastchance_mobile/features/map/application/map_search_controller.dart';
import 'package:lastchance_mobile/features/map/data/map_repository.dart';
import 'package:lastchance_mobile/features/map/domain/map_filters.dart';
import 'package:lastchance_mobile/features/map/domain/map_pin.dart';

import 'map_domain_test.dart' show pinJson;

/// Records every query it is asked for and returns whatever the test supplies.
class _FakeMapRepository extends MapRepository {
  _FakeMapRepository(this.handler) : super(Dio());

  final Future<MapSearchResult> Function(MapSearchQuery query) handler;
  final List<MapSearchQuery> queries = <MapSearchQuery>[];

  @override
  Future<MapSearchResult> search(
    MapSearchQuery query, {
    CancelToken? cancelToken,
  }) {
    queries.add(query);
    return handler(query);
  }
}

MapSearchResult resultWith(List<String> unitIds, {bool truncated = false}) =>
    MapSearchResult(
      pins: unitIds
          .map((id) => MapPin.fromJson(pinJson(unitId: id)))
          .toList(growable: false),
      truncated: truncated,
    );

/// Longer than the debounce, so a scheduled search has certainly run.
Future<void> settle() =>
    Future<void>.delayed(kSearchDebounce + const Duration(milliseconds: 150));

/// Builds a container with the fake wired in AND a live subscription.
///
/// The subscription is not optional: mapSearchProvider is autoDispose, so a
/// bare `container.read` builds it and immediately tears it down again —
/// cancelling the initial search mid-flight and making every count off by one.
/// In the app a widget watches it continuously; this reproduces that.
({ProviderContainer container, _FakeMapRepository repo}) harness(
  Future<MapSearchResult> Function(MapSearchQuery query) handler,
) {
  final repo = _FakeMapRepository(handler);
  final container = ProviderContainer(
    overrides: <Override>[mapRepositoryProvider.overrideWithValue(repo)],
  );
  container.listen<MapSearchState>(
    mapSearchProvider,
    (_, __) {},
    fireImmediately: true,
  );
  return (container: container, repo: repo);
}

void main() {
  test('searches once on start, for an inflated prefetch box', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    expect(repo.queries.length, 1);
    // The fetched box must be strictly larger than the viewport, or the
    // prefetch margin does nothing.
    final requested = repo.queries.single.bounds;
    expect(requested.spanLng, greaterThan(kDefaultBounds.spanLng));
    expect(container.read(mapSearchProvider).pins.length, 1);
    expect(container.read(mapSearchProvider).isLoading, isFalse);
  });

  test('a pan inside the prefetched box does not hit the network', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();
    expect(repo.queries.length, 1);

    // Nudge the viewport slightly — still well within the 1.4x margin.
    container.read(mapSearchProvider.notifier).onBoundsChanged(
          const MapBounds(
            minLng: 37.86,
            minLat: 26.56,
            maxLng: 38.07,
            maxLat: 26.82,
          ),
        );
    await settle();

    expect(repo.queries.length, 1, reason: 'served from the prefetch margin');
  });

  test('a burst of pans collapses to one request', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();
    final before = repo.queries.length;

    final notifier = container.read(mapSearchProvider.notifier);
    for (var i = 0; i < 8; i++) {
      // Each far outside the prefetch box, so every one would otherwise fetch.
      notifier.onBoundsChanged(
        MapBounds(
          minLng: 40.0 + i,
          minLat: 20.0,
          maxLng: 40.5 + i,
          maxLat: 20.5,
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    await settle();

    expect(repo.queries.length - before, 1);
  });

  test('a cancelled request never surfaces as an error', () async {
    final h = harness(
      (_) async => throw const ApiException(
        code: 'CANCELLED',
        message: 'Request superseded',
      ),
    );
    final container = h.container;
    addTearDown(container.dispose);
    await settle();

    // Before guardApi distinguished cancellation, this arrived as a NETWORK
    // error and every superseded pan showed the user a connection failure.
    expect(container.read(mapSearchProvider).error, isNull);
  });

  test('a real failure does surface', () async {
    final h = harness(
      (_) async => throw const ApiException(
        code: 'NETWORK',
        message: 'Network error',
      ),
    );
    final container = h.container;
    addTearDown(container.dispose);
    await settle();

    final state = container.read(mapSearchProvider);
    expect(state.error?.isNetwork, isTrue);
    expect(state.isLoading, isFalse);
  });

  test('an unsearchable viewport is refused without a request', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();
    final before = repo.queries.length;

    container.read(mapSearchProvider.notifier).onBoundsChanged(
          const MapBounds(
            minLng: -180,
            minLat: -80,
            maxLng: 180,
            maxLat: 80,
          ),
        );
    await settle();

    expect(repo.queries.length, before, reason: 'certain 400 not sent');
    expect(container.read(mapSearchProvider).error?.code, 'VIEWPORT_TOO_LARGE');
  });

  test('switching booking type refetches even within the prefetch box',
      () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();
    final before = repo.queries.length;

    // Prices and availability both change with the mode, so cached pins are
    // wrong even though the viewport has not moved.
    container.read(mapSearchProvider.notifier).setBookingType(BookingType.hourly);
    await settle();

    expect(repo.queries.length, before + 1);
    expect(repo.queries.last.bookingType, BookingType.hourly);
  });

  test('a selection that leaves the results is cleared', () async {
    var call = 0;
    final h = harness((_) async {
      call++;
      return call == 1
          ? resultWith(<String>['a', 'b'])
          : resultWith(<String>['b']);
    });
    final container = h.container;
    addTearDown(container.dispose);
    await settle();

    final notifier = container.read(mapSearchProvider.notifier);
    notifier.select('a');
    expect(container.read(mapSearchProvider).selectedUnitId, 'a');

    // Pan somewhere 'a' is not returned; the detail sheet must not keep
    // showing a stay that is no longer on the map.
    notifier.onBoundsChanged(
      const MapBounds(minLng: 45, minLat: 24, maxLng: 45.4, maxLat: 24.4),
    );
    await settle();

    expect(container.read(mapSearchProvider).selectedUnitId, isNull);
    expect(container.read(mapSearchProvider).selectedPin, isNull);
  });

  test('tapping the selected pin again deselects it', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    addTearDown(container.dispose);
    await settle();

    final notifier = container.read(mapSearchProvider.notifier)..select('a');
    expect(container.read(mapSearchProvider).selectedUnitId, 'a');
    notifier.select('a');
    expect(container.read(mapSearchProvider).selectedUnitId, isNull);
  });

  test('view mode toggles between map and list', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    addTearDown(container.dispose);
    await settle();

    final notifier = container.read(mapSearchProvider.notifier);
    expect(container.read(mapSearchProvider).viewMode, MapViewMode.map);
    notifier.toggleViewMode();
    expect(container.read(mapSearchProvider).viewMode, MapViewMode.list);
  });

  test('half a date range is never sent to the server', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    container
        .read(mapSearchProvider.notifier)
        .setDateRange(DateTime.utc(2026, 9, 1), null);
    await settle();

    // The server rejects a half range outright rather than silently dropping
    // the availability filter, so the query must carry neither bound.
    final params = repo.queries.last.toQueryParameters();
    expect(params.containsKey('check_in_utc'), isFalse);
    expect(params.containsKey('check_out_utc'), isFalse);
  });

  test('price bounds reach the wire in minor units', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    container.read(mapSearchProvider.notifier).setPriceRange(10000, 90000);
    await settle();

    final params = repo.queries.last.toQueryParameters();
    expect(params['min_price_minor'], 10000);
    expect(params['max_price_minor'], 90000);
  });

  test('a zero floor survives the trip to the server', () async {
    // The falsy-check bug in transit: dropping a 0 bound would quietly widen
    // the search past what the guest asked for.
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    container.read(mapSearchProvider.notifier).setPriceRange(0, null);
    await settle();

    final params = repo.queries.last.toQueryParameters();
    expect(params['min_price_minor'], 0);
    expect(params.containsKey('max_price_minor'), isFalse);
  });

  test('one bound alone omits the other rather than sending null', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    container.read(mapSearchProvider.notifier).setPriceRange(null, 90000);
    await settle();

    final params = repo.queries.last.toQueryParameters();
    expect(params.containsKey('min_price_minor'), isFalse);
    expect(params['max_price_minor'], 90000);
  });

  test('applying the filters already in force does not refetch', () async {
    // Opening the sheet, changing nothing and tapping Apply is not a search.
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    final notifier = container.read(mapSearchProvider.notifier);
    notifier.applyFilters(const MapFilters(guests: 2));
    await settle();
    final afterFirst = repo.queries.length;

    notifier.applyFilters(const MapFilters(guests: 2));
    await settle();

    expect(repo.queries.length, afterFirst);
  });

  test('clearing filters refetches without them', () async {
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    final notifier = container.read(mapSearchProvider.notifier);
    notifier.applyFilters(const MapFilters(guests: 2, maxPriceMinor: 90000));
    await settle();
    expect(repo.queries.last.toQueryParameters()['guests'], 2);

    notifier.clearFilters();
    await settle();

    final params = repo.queries.last.toQueryParameters();
    expect(params.containsKey('guests'), isFalse);
    expect(params.containsKey('max_price_minor'), isFalse);
    expect(container.read(mapSearchProvider).filters.isEmpty, isTrue);
  });

  test('a filter change refetches even inside the prefetched box', () async {
    // Price and availability both change which units qualify, so this can
    // never be served from what is already in hand.
    final h = harness((_) async => resultWith(<String>['a']));
    final container = h.container;
    final repo = h.repo;
    addTearDown(container.dispose);
    await settle();

    final before = repo.queries.length;
    container.read(mapSearchProvider.notifier).setPriceRange(null, 50000);
    await settle();

    expect(repo.queries.length, greaterThan(before));
  });
}
