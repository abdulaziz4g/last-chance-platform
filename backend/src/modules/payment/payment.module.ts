import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { PaymentController } from './payment.controller';
import { WebhookController } from './webhook.controller';
import { EscrowAdminController } from './escrow-admin.controller';
import { EscrowAdminService } from './application/escrow-admin.service';
import { PaymentService } from './application/payment.service';
import { WebhookService } from './application/webhook.service';
import { PayoutService } from './application/payout.service';
import { RefundService } from './application/refund.service';
import { LedgerService } from './infrastructure/ledger.service';
import { PaymentRepository } from './infrastructure/payment.repository';
import { WebhookRepository } from './infrastructure/webhook.repository';
import { PayoutRepository } from './infrastructure/payout.repository';
import { MockPaymentProvider } from './providers/mock.provider';
import { StripePaymentProvider } from './providers/stripe.provider';
import { PaymentProviderRegistry } from './providers/provider.registry';
import { PaymentWorker } from './workers/payment.worker';

@Module({
  imports: [BookingModule],
  controllers: [PaymentController, WebhookController, EscrowAdminController],
  providers: [
    EscrowAdminService,
    PaymentService,
    WebhookService,
    PayoutService,
    RefundService,
    LedgerService,
    PaymentRepository,
    WebhookRepository,
    PayoutRepository,
    MockPaymentProvider,
    StripePaymentProvider,
    PaymentProviderRegistry,
    PaymentWorker,
  ],
  exports: [PaymentService, PayoutService],
})
export class PaymentModule {}
