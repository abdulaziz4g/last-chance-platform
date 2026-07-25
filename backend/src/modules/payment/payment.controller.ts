import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PaymentService, InitiatePaymentResult } from './application/payment.service';
import { PayoutService } from './application/payout.service';
import { WebhookService } from './application/webhook.service';
import { PaymentProviderRegistry } from './providers/provider.registry';
import { Payment, PaymentProviderName, Payout } from './domain/types';
import { ValidationFailedError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/config.service';
import { Public } from '../../common/auth/decorators';
import { initiatePaymentSchema, parseWith } from './payment.schemas';

/** What a checkout client needs to know before it can collect a payment. */
export interface PaymentClientConfig {
  /** The provider a client should ask for. STRIPE wins when configured. */
  provider: PaymentProviderName;
  enabled: PaymentProviderName[];
  /** Publishable key for Stripe.js; null unless STRIPE is the active provider. */
  publishableKey: string | null;
}

@Controller()
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly payoutService: PayoutService,
    private readonly webhookService: WebhookService,
    private readonly registry: PaymentProviderRegistry,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Lets the checkout page pick a flow without hardcoding one. A real PSP is
   * preferred whenever its credentials are present; MOCK is what remains in a
   * dev box with no keys, and is never registered in production.
   */
  @Public()
  @Get('payments/config')
  clientConfig(): PaymentClientConfig {
    const enabled = this.registry.enabledNames();
    const provider: PaymentProviderName = enabled.includes('STRIPE')
      ? 'STRIPE'
      : 'MOCK';
    return {
      provider,
      enabled,
      publishableKey:
        provider === 'STRIPE'
          ? (this.config.stripePublishableKey ?? null)
          : null,
    };
  }

  /** Start payment for a held booking; returns the provider client action. */
  @Post('payments/initiate')
  @HttpCode(201)
  initiate(@Body() body: unknown): Promise<InitiatePaymentResult> {
    const cmd = parseWith(initiatePaymentSchema, body);
    return this.paymentService.initiate(cmd);
  }

  /**
   * DEV/TEST ONLY. The mock PSP SDK calls this after presenting its payment
   * sheet; it drives a server-signed MOCK capture through the real webhook
   * pipeline, so the client's confirmation stays webhook-driven. Disabled in
   * production (WebhookService.simulateMockCapture throws there).
   */
  @Post('payments/:id/simulate-capture')
  @HttpCode(202)
  async simulateCapture(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ accepted: boolean }> {
    await this.webhookService.simulateMockCapture(id);
    return { accepted: true };
  }

  @Get('payments/:id')
  getPayment(@Param('id', ParseUUIDPipe) id: string): Promise<Payment> {
    return this.paymentService.getById(id);
  }

  @Get('payouts/booking/:bookingId')
  async getPayoutForBooking(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<Payout> {
    const payout = await this.payoutService.getByBooking(bookingId);
    if (!payout) {
      throw new ValidationFailedError('No payout exists for this booking', {
        bookingId,
      });
    }
    return payout;
  }
}
