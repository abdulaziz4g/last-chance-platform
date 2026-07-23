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
import { Payment, Payout } from './domain/types';
import { ValidationFailedError } from '../../common/errors/domain-errors';
import { initiatePaymentSchema, parseWith } from './payment.schemas';

@Controller()
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly payoutService: PayoutService,
  ) {}

  /** Start payment for a held booking; returns the provider client action. */
  @Post('payments/initiate')
  @HttpCode(201)
  initiate(@Body() body: unknown): Promise<InitiatePaymentResult> {
    const cmd = parseWith(initiatePaymentSchema, body);
    return this.paymentService.initiate(cmd);
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
