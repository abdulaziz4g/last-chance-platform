import 'package:flutter/material.dart';

import '../../../app/design_tokens.dart';
import '../../../core/money.dart';
import '../domain/booking.dart';
import 'hold_countdown.dart';

/// Shared presentation for the hold → pay → confirmed states, reused by both
/// the plain booking flow and the flash-deal claim flow. A claimed deal is
/// just a discounted PENDING_PAYMENT booking, so the same views render both;
/// the discount line only appears when discountMinor > 0.

class HoldActiveView extends StatelessWidget {
  const HoldActiveView({
    super.key,
    required this.booking,
    required this.paymentInitiated,
    required this.onPay,
    required this.onExpired,
  });

  final Booking booking;
  final bool paymentInitiated;
  final VoidCallback onPay;
  final VoidCallback onExpired;

  @override
  Widget build(BuildContext context) {
    final hasDiscount = booking.discountMinor > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const SizedBox(height: 16),
        HoldCountdown(
          expiresAt: booking.holdExpiresAt ?? DateTime.now().toUtc(),
          onExpired: onExpired,
        ),
        const SizedBox(height: 32),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: <Widget>[
                _row('Base', formatMinor(booking.baseAmountMinor, booking.currency)),
                if (hasDiscount)
                  _row(
                    'Flash discount',
                    '−${formatMinor(booking.discountMinor, booking.currency)}',
                    accent: true,
                  ),
                _row('Service fee', formatMinor(booking.serviceFeeMinor, booking.currency)),
                _row('VAT', formatMinor(booking.taxesMinor, booking.currency)),
                const Divider(height: 24),
                _row(
                  'Total',
                  formatMinor(booking.totalAmountMinor, booking.currency),
                  emphasized: true,
                ),
              ],
            ),
          ),
        ),
        const Spacer(),
        FilledButton(
          onPressed: paymentInitiated ? null : onPay,
          child: Text(paymentInitiated ? 'Processing payment…' : 'Pay now'),
        ),
        const SizedBox(height: 8),
        Text(
          booking.bookingCode,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: LcBrand.muted),
        ),
      ],
    );
  }

  Widget _row(
    String label,
    String value, {
    bool emphasized = false,
    bool accent = false,
  }) {
    final style = TextStyle(
      fontSize: emphasized ? 17 : 14,
      fontWeight: emphasized ? FontWeight.w600 : FontWeight.w400,
      color: accent ? LcBrand.coral : null,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[Text(label, style: style), Text(value, style: style)],
      ),
    );
  }
}

class HoldConfirmedView extends StatelessWidget {
  const HoldConfirmedView({
    super.key,
    required this.booking,
    required this.onDone,
  });

  final Booking booking;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    return HoldNoticeView(
      icon: Icons.check_circle_outline,
      color: LcStatus.success,
      title: 'Booking confirmed',
      body: 'Reference ${booking.bookingCode}. Check-in details and your '
          'digital key arrive before the stay.',
      actionLabel: 'Done',
      onAction: onDone,
    );
  }
}

class HoldNoticeView extends StatelessWidget {
  const HoldNoticeView({
    super.key,
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const Spacer(),
        Icon(icon, size: 64, color: color),
        const SizedBox(height: 16),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Text(
          body,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14, color: LcBrand.muted),
        ),
        const Spacer(),
        FilledButton(onPressed: onAction, child: Text(actionLabel)),
      ],
    );
  }
}
