import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme.dart';
import '../../../core/money.dart';
import '../../booking/presentation/booking_flow_screen.dart';
import '../application/deals_feed_controller.dart';
import '../domain/flash_deal.dart';
import 'deal_claim_screen.dart';

/// The live flash-deal feed — the app's home. Cards show struck-through
/// pricing, remaining inventory, and a countdown that ticks locally (WS push
/// replaces the poll later). Tapping a deal opens the claim flow.
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Flash deals'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(dealsFeedProvider.notifier).refresh(),
          ),
          IconButton(
            icon: const Icon(Icons.event_available_outlined),
            tooltip: 'Book directly',
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
          text: 'Deals are warming up.\n$err',
          onRetry: () => ref.read(dealsFeedProvider.notifier).refresh(),
        ),
        data: (list) {
          if (list.isEmpty) {
            return _Message(
              icon: Icons.local_fire_department_outlined,
              text: 'No live deals right now.\nCheck back soon.',
              onRetry: () => ref.read(dealsFeedProvider.notifier).refresh(),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(dealsFeedProvider.notifier).refresh(),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
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

  String _countdown(int seconds) {
    if (seconds <= 0) return 'Ended';
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    final ss = s.toString().padLeft(2, '0');
    return h > 0 ? '${h}h ${m}m ${ss}s' : '$m:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final secondsLeft = deal.remainingSecondsAt(now);
    final base = deal.baseRateMinor;
    final net = deal.netRateMinor;

    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: LcColors.brass400.withValues(alpha: 0.3)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      deal.propertyName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: LcColors.brass400,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '−${deal.discountPct.toStringAsFixed(0)}%',
                      style: const TextStyle(
                        color: LcColors.ink950,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                '${deal.unitName} · ${deal.city}',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.white.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  if (net != null && base != null) ...<Widget>[
                    Text(
                      formatMinor(net, deal.currency),
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: LcColors.brass300,
                        fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      formatMinor(base, deal.currency),
                      style: TextStyle(
                        fontSize: 14,
                        decoration: TextDecoration.lineThrough,
                        color: Colors.white.withValues(alpha: 0.4),
                      ),
                    ),
                    Text(
                      deal.isHourly ? ' /hr' : ' /night',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      Text(
                        _countdown(secondsLeft),
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: secondsLeft < 3600
                              ? LcColors.danger
                              : Colors.white.withValues(alpha: 0.85),
                          fontFeatures: const <FontFeature>[
                            FontFeature.tabularFigures(),
                          ],
                        ),
                      ),
                      Text(
                        '${deal.quantityRemaining} of ${deal.quantityTotal} left',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white.withValues(alpha: 0.5),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
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
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 56, color: Colors.white.withValues(alpha: 0.3)),
          const SizedBox(height: 16),
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.6)),
          ),
          const SizedBox(height: 20),
          OutlinedButton(onPressed: onRetry, child: const Text('Refresh')),
        ],
      ),
    );
  }
}
