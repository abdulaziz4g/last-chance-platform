import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';
import '../../../core/money.dart';
import '../../booking/presentation/booking_flow_screen.dart';
import '../application/deals_feed_controller.dart';
import '../domain/flash_deal.dart';
import 'deal_claim_screen.dart';

/// The live flash-deal feed — the app's home.
///
/// Styled from the design package: warm cream canvas, white cards carrying the
/// one brand shadow, coral reserved for price and the discount badge. Nothing
/// here names a colour or a radius directly; they come from design_tokens.dart,
/// which is what lets the whole app move if the brand does.
class DealsScreen extends ConsumerStatefulWidget {
  const DealsScreen({super.key});

  @override
  ConsumerState<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends ConsumerState<DealsScreen> {
  Timer? _ticker;
  DateTime _now = DateTime.now().toUtc();

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now().toUtc());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final deals = ref.watch(dealsFeedProvider);
    final strings = LcStrings.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.flashDeals),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: strings.refresh,
            onPressed: () => ref.read(dealsFeedProvider.notifier).refresh(),
          ),
          IconButton(
            icon: const Icon(Icons.event_available_outlined),
            tooltip: strings.bookDirectly,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const BookingFlowScreen()),
            ),
          ),
        ],
      ),
      body: deals.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => _Message(
          icon: Icons.cloud_off,
          text: '${strings.dealsWarmingUp}\n$err',
          onRetry: () => ref.read(dealsFeedProvider.notifier).refresh(),
        ),
        data: (list) {
          if (list.isEmpty) {
            return _Message(
              icon: Icons.local_fire_department_outlined,
              text: strings.noLiveDeals,
              onRetry: () => ref.read(dealsFeedProvider.notifier).refresh(),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(dealsFeedProvider.notifier).refresh(),
            child: ListView.separated(
              padding: const EdgeInsetsDirectional.all(LcSpacing.screenPadding),
              itemCount: list.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(height: LcSpacing.gridGap),
              itemBuilder: (context, i) => _DealCard(
                deal: list[i],
                now: _now,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => DealClaimScreen(deal: list[i]),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  const _DealCard({required this.deal, required this.now, required this.onTap});

  final FlashDeal deal;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = LcStrings.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final secondsLeft = deal.remainingSecondsAt(now);
    final base = deal.baseRateMinor;
    final net = deal.netRateMinor;

    return Semantics(
      button: true,
      label: '${deal.propertyName}, ${deal.unitName}',
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
              // The package's single card shadow, replacing the coral hairline
              // border this card used to carry. A stroke in the accent colour
              // on every card spends the loudest thing in the palette on the
              // container rather than on the price inside it.
              boxShadow: LcShadow.card,
            ),
            padding: const EdgeInsetsDirectional.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        deal.propertyName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: LcType.button),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _DiscountBadge(pct: deal.discountPct),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${deal.unitName}${strings.listSeparator}${deal.city}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: LcBrand.muted),
                ),
                const SizedBox(height: LcSpacing.gridGap),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: <Widget>[
                    if (net != null && base != null)
                      // Flexible so an Arabic price row, which renders wider
                      // for the same figures, shrinks instead of overflowing.
                      Flexible(
                        child: _PriceRow(
                          netMinor: net,
                          baseMinor: base,
                          currency: deal.currency,
                          locale: locale,
                          hourly: deal.isHourly,
                        ),
                      ),
                    const Spacer(),
                    _Countdown(
                      secondsLeft: secondsLeft,
                      remaining: deal.quantityRemaining,
                      total: deal.quantityTotal,
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

class _DiscountBadge extends StatelessWidget {
  const _DiscountBadge({required this.pct});

  final num pct;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: LcBrand.coral,
          borderRadius: BorderRadius.all(Radius.circular(LcRadius.pill)),
        ),
        child: Padding(
          padding:
              const EdgeInsetsDirectional.symmetric(horizontal: 10, vertical: 4),
          child: Text(
            '−${pct.toStringAsFixed(0)}%',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: LcBrand.white,
                  fontWeight: LcType.figure,
                ),
          ),
        ),
      );
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.netMinor,
    required this.baseMinor,
    required this.currency,
    required this.locale,
    required this.hourly,
  });

  final int netMinor;
  final int baseMinor;
  final String currency;
  final String locale;
  final bool hourly;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = LcStrings.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: <Widget>[
        Flexible(
          child: Text(
            formatMinor(netMinor, currency, locale: locale),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleMedium?.copyWith(
              color: LcBrand.coral,
              fontWeight: LcType.figure,
              // Tabular figures keep a per-second countdown and a price from
              // jittering as digits change width.
              fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
            ),
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            formatMinor(baseMinor, currency, locale: locale),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              decoration: TextDecoration.lineThrough,
              color: LcBrand.muted,
            ),
          ),
        ),
        Text(
          strings.perUnitShort(hourly: hourly),
          style: theme.textTheme.labelSmall?.copyWith(color: LcBrand.muted),
        ),
      ],
    );
  }
}

class _Countdown extends StatelessWidget {
  const _Countdown({
    required this.secondsLeft,
    required this.remaining,
    required this.total,
  });

  final int secondsLeft;
  final int remaining;
  final int total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = LcStrings.of(context);

    final label = secondsLeft <= 0
        ? strings.dealEnded
        : () {
            final h = secondsLeft ~/ 3600;
            final m = (secondsLeft % 3600) ~/ 60;
            final s = (secondsLeft % 60).toString().padLeft(2, '0');
            return h > 0 ? '${h}h ${m}m ${s}s' : '$m:$s';
          }();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(
          label,
          style: theme.textTheme.labelLarge?.copyWith(
            fontWeight: LcType.button,
            // Danger, not coral, inside the final hour: urgency must not be
            // the same colour as the call to action, or "hurry" and "buy" read
            // as the same signal.
            color: secondsLeft < 3600 ? LcStatus.danger : LcBrand.text,
            fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
          ),
        ),
        Text(
          strings.quantityLeft(remaining, total),
          style: theme.textTheme.labelSmall?.copyWith(color: LcBrand.muted),
        ),
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text, required this.onRetry});

  final IconData icon;
  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = LcStrings.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsetsDirectional.all(LcSpacing.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            // Sand, not coral: an empty state is not an error and should not
            // shout in the brand's action colour.
            Icon(icon, size: 56, color: LcBrand.sand),
            const SizedBox(height: LcSpacing.gridGap),
            Text(
              text,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: LcBrand.muted),
            ),
            const SizedBox(height: 20),
            OutlinedButton(onPressed: onRetry, child: Text(strings.refresh)),
          ],
        ),
      ),
    );
  }
}
