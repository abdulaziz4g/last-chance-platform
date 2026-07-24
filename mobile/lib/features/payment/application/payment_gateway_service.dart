import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config.dart';
import '../data/payment_repository.dart';

/// Result of a PSP handoff — the booking watcher detects confirmation via WS.
sealed class PaymentGatewayResult {
  const PaymentGatewayResult();
}

class PaymentSubmitted extends PaymentGatewayResult {
  const PaymentSubmitted();
}

class PaymentCancelled extends PaymentGatewayResult {
  const PaymentCancelled(this.reason);
  final String reason;
}

/// Routes payment completion through the active PSP:
///
///   MOCK  → simulateCapture (server-signed webhook, no real money)
///   STRIPE → Stripe Payment Sheet using the clientSecret from createIntent
///
/// The booking watcher drives confirmation in both cases — capture arrives
/// at the backend via webhook either way.
class PaymentGatewayService {
  const PaymentGatewayService(this._payments);

  final PaymentRepository _payments;

  Future<PaymentGatewayResult> completePayment(
    InitiatedPayment initiated,
  ) async {
    final action = initiated.clientAction;
    if (action == null) {
      return const PaymentCancelled('No client action from server');
    }

    final type = action['type'] as String?;

    switch (type) {
      case 'MOCK_CONFIRM':
        await _payments.simulateCapture(paymentId: initiated.paymentId);
        return const PaymentSubmitted();

      case 'STRIPE_CLIENT_SECRET':
        return _handleStripePaymentSheet(action);

      default:
        return PaymentCancelled('Unknown client action type: $type');
    }
  }

  Future<PaymentGatewayResult> _handleStripePaymentSheet(
    Map<String, dynamic> action,
  ) async {
    final clientSecret = action['clientSecret'] as String?;
    if (clientSecret == null || clientSecret.isEmpty) {
      return const PaymentCancelled('Missing Stripe client secret');
    }
    if (!LcConfig.isStripeEnabled) {
      return const PaymentCancelled(
        'Stripe not configured (set LC_STRIPE_PK)',
      );
    }

    // The Stripe Flutter SDK integration point. When flutter_stripe is added:
    //
    //   await Stripe.instance.initPaymentSheet(
    //     paymentSheetParameters: SetupPaymentSheetParameters(
    //       paymentIntentClientSecret: clientSecret,
    //       merchantDisplayName: 'Last Chance',
    //       style: ThemeMode.system,
    //     ),
    //   );
    //   await Stripe.instance.presentPaymentSheet();
    //
    // Capture arrives at the backend via Stripe webhook → same pipeline as
    // MOCK. The booking watcher picks up CONFIRMED either way.
    //
    // For now, throw so callers know Stripe SDK integration is pending:
    throw UnimplementedError(
      'Stripe Payment Sheet requires flutter_stripe — '
      'add it to pubspec.yaml and uncomment the integration above',
    );
  }
}

final paymentGatewayProvider = Provider<PaymentGatewayService>(
  (ref) => PaymentGatewayService(ref.watch(paymentRepositoryProvider)),
);
