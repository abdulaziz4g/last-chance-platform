import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/design_tokens.dart';
import '../../../core/config.dart';
import '../../../core/money.dart';
import '../../booking/application/hold_flow_controller.dart';
import '../../booking/domain/booking.dart';
import '../../booking/presentation/hold_flow_views.dart';
import '../data/deal_repository.dart';
import '../domain/flash_deal.dart';

/// Claim a flash deal. Shows the discounted offer + a stay-day picker, then —
/// on reserve — hands off to the SHARED hold/payment views (a claimed deal is
/// just a discounted PENDING_PAYMENT booking). SOLD_OUT and UNIT_UNAVAILABLE
/// get their own honest messaging.
class DealClaimScreen extends ConsumerStatefulWidget {
  const DealClaimScreen({super.key, required this.deal});

  final FlashDeal deal;

  @override
  ConsumerState<DealClaimScreen> createState() => _DealClaimScreenState();
}

class _DealClaimScreenState extends ConsumerState<DealClaimScreen> {
  int _daysAhead = 1;

  @override
  void initState() {
    super.initState();
    // Each entry to this screen starts a fresh flow.
    Future.microtask(() => ref.read(holdFlowProvider.notifier).reset());
  }

  ({DateTime checkIn, DateTime checkOut}) _window() {
    final base = DateTime.now().toUtc().add(Duration(days: _daysAhead));
    if (widget.deal.isHourly) {
      final checkIn = DateTime.utc(base.year, base.month, base.day, 20);
      return (checkIn: checkIn, checkOut: checkIn.add(const Duration(hours: 2)));
    }
    // Nightly: whole 24h night (pricing requires whole nights).
    final checkIn = DateTime.utc(base.year, base.month, base.day, 12);
    return (checkIn: checkIn, checkOut: checkIn.add(const Duration(hours: 24)));
  }

  void _reserve() {
    final win = _window();
    ref.read(holdFlowProvider.notifier).claimDeal(
          widget.deal.id,
          ClaimDealRequest(
            guestId: LcConfig.demoGuestId,
            bookingType:
                widget.deal.isHourly ? BookingType.hourly : BookingType.nightly,
            checkInUtc: win.checkIn,
            checkOutUtc: win.checkOut,
            guestsCount: 1,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(holdFlowProvider);
    final controller = ref.read(holdFlowProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: Text('−${widget.deal.discountPct.toStringAsFixed(0)}% flash deal')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: switch (state) {
          HoldIdle() => _Offer(
              deal: widget.deal,
              daysAhead: _daysAhead,
              window: _window(),
              onDaysChanged: (d) => setState(() => _daysAhead = d),
              onReserve: LcConfig.demoIdsConfigured ? _reserve : null,
            ),
          HoldPlacing() => const Center(child: CircularProgressIndicator()),
          HoldActive(:final booking, :final paymentInitiated) => HoldActiveView(
              booking: booking,
              paymentInitiated: paymentInitiated,
              onPay: controller.startPayment,
              onExpired: controller.onCountdownExpired,
            ),
          HoldConfirmed(:final booking) => HoldConfirmedView(
              booking: booking,
              onDone: () => _finish(),
            ),
          HoldExpired() => HoldNoticeView(
              icon: Icons.hourglass_disabled,
              color: LcStatus.danger,
              title: 'Hold expired',
              body: 'The 10-minute window lapsed and the unit was released.',
              actionLabel: 'Back to deals',
              onAction: () => _finish(),
            ),
          HoldFailed(:final code, :final message) => HoldNoticeView(
              icon: code == 'FLASH_DEAL_SOLD_OUT'
                  ? Icons.local_fire_department
                  : Icons.error_outline,
              color: LcStatus.danger,
              title: switch (code) {
                'FLASH_DEAL_SOLD_OUT' => 'Just sold out',
                'UNIT_UNAVAILABLE' => 'That slot is taken',
                _ => 'Something went wrong',
              },
              body: switch (code) {
                'FLASH_DEAL_SOLD_OUT' =>
                  'Every discounted spot for this deal is gone. No slot was reserved.',
                'UNIT_UNAVAILABLE' =>
                  'Another guest holds that window. Try a different day — your deal slot was not used.',
                _ => message,
              },
              actionLabel: code == 'UNIT_UNAVAILABLE' ? 'Pick another day' : 'Back to deals',
              onAction: code == 'UNIT_UNAVAILABLE'
                  ? controller.reset
                  : () => _finish(),
            ),
        },
      ),
    );
  }

  void _finish() {
    // Refresh remaining-inventory counts and return to the feed.
    ref.read(holdFlowProvider.notifier).reset();
    if (mounted) Navigator.of(context).pop();
  }
}

class _Offer extends StatelessWidget {
  const _Offer({
    required this.deal,
    required this.daysAhead,
    required this.window,
    required this.onDaysChanged,
    required this.onReserve,
  });

  final FlashDeal deal;
  final int daysAhead;
  final ({DateTime checkIn, DateTime checkOut}) window;
  final ValueChanged<int> onDaysChanged;
  final VoidCallback? onReserve;

  @override
  Widget build(BuildContext context) {
    final base = deal.baseRateMinor;
    final net = deal.netRateMinor;
    final ci = window.checkIn;
    final co = window.checkOut;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  deal.title.toUpperCase(),
                  style: TextStyle(
                    fontSize: 11,
                    letterSpacing: 2,
                    color: LcBrand.coral,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  deal.propertyName,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
                Text(
                  '${deal.unitName} · ${deal.city}',
                  style: TextStyle(
                    fontSize: 13,
                    color: LcBrand.muted,
                  ),
                ),
                const SizedBox(height: 16),
                if (net != null && base != null)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      Text(
                        formatMinor(net, deal.currency),
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: LcBrand.coral,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          formatMinor(base, deal.currency),
                          style: TextStyle(
                            fontSize: 15,
                            decoration: TextDecoration.lineThrough,
                            color: LcBrand.muted,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          deal.isHourly ? ' / hour' : ' / night',
                          style: TextStyle(
                            fontSize: 13,
                            color: LcBrand.muted,
                          ),
                        ),
                      ),
                    ],
                  ),
                const SizedBox(height: 6),
                Text(
                  '${deal.quantityRemaining} of ${deal.quantityTotal} discounted spots left',
                  style: TextStyle(
                    fontSize: 12,
                    color: LcBrand.muted,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'CHOOSE YOUR ${deal.isHourly ? 'SLOT' : 'NIGHT'}',
          style: TextStyle(
            fontSize: 11,
            letterSpacing: 2,
            color: LcBrand.muted,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            IconButton.outlined(
              onPressed: daysAhead > 1 ? () => onDaysChanged(daysAhead - 1) : null,
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: Column(
                children: <Widget>[
                  Text(
                    _fmtDate(ci),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    '${_fmtTime(ci)} – ${_fmtTime(co)} UTC',
                    style: TextStyle(
                      fontSize: 12,
                      color: LcBrand.muted,
                    ),
                  ),
                ],
              ),
            ),
            IconButton.outlined(
              onPressed: daysAhead < 14 ? () => onDaysChanged(daysAhead + 1) : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        const Spacer(),
        if (onReserve == null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Set --dart-define=LC_GUEST_ID to reserve in this dev build.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: LcBrand.muted),
            ),
          ),
        FilledButton(
          onPressed: onReserve,
          child: Text('Reserve at −${deal.discountPct.toStringAsFixed(0)}%'),
        ),
        const SizedBox(height: 8),
        Text(
          'A 10-minute hold is placed; no charge until you pay.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: LcBrand.muted),
        ),
      ],
    );
  }

  static String _fmtDate(DateTime d) {
    const months = <String>[
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  static String _fmtTime(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}
