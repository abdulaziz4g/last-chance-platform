import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/deal_event_service.dart';
import '../data/deal_repository.dart';
import '../domain/flash_deal.dart';

/// Loads the active-deal feed on init, then reactively refreshes whenever
/// the WebSocket gateway pushes a deal event (CLAIMED, SOLD_OUT, ACTIVATED,
/// ENDED). The refresh is debounced so a rapid burst of events (e.g. during
/// a concurrency herd) still produces one HTTP round-trip.
class DealsFeedController extends AutoDisposeAsyncNotifier<List<FlashDeal>> {
  StreamSubscription<DealEvent>? _eventSub;
  Timer? _debounce;

  @override
  Future<List<FlashDeal>> build() {
    ref.onDispose(() {
      _eventSub?.cancel();
      _debounce?.cancel();
    });

    final events = ref.read(dealEventServiceProvider);
    _eventSub = events.events.listen((_) => _debouncedRefresh());

    return ref.read(dealRepositoryProvider).getActiveDeals();
  }

  void _debouncedRefresh() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => refresh());
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
      () => ref.read(dealRepositoryProvider).getActiveDeals(),
    );
  }
}

final dealsFeedProvider =
    AutoDisposeAsyncNotifierProvider<DealsFeedController, List<FlashDeal>>(
  DealsFeedController.new,
);
