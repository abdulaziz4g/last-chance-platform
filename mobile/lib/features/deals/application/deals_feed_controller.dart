import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/deal_repository.dart';
import '../domain/flash_deal.dart';

/// Loads the live active-deal feed. `refresh()` re-pulls after a claim so the
/// remaining-inventory counts stay honest. A later iteration replaces the pull
/// with WS push (lc.events.deals) — the `AsyncValue<List<FlashDeal>>` shape stays.
class DealsFeedController extends AutoDisposeAsyncNotifier<List<FlashDeal>> {
  @override
  Future<List<FlashDeal>> build() {
    return ref.read(dealRepositoryProvider).getActiveDeals();
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
