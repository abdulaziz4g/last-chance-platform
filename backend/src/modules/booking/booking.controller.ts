import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { BookingService } from './application/booking.service';
import { Booking } from './domain/types';
import { parseWith as parse } from '../../common/validation';
import { RateLimit } from '../../common/auth/decorators';
import {
  cancelBookingSchema as cancelSchema,
  confirmBookingSchema as confirmSchema,
  createHoldSchema,
} from './booking.schemas';

/**
 * Thin transport layer — validation via zod (schemas shared with the OpenAPI
 * document in booking.schemas.ts), all behavior in BookingService.
 */

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post('hold')
  @RateLimit(20, 60)
  @HttpCode(201)
  createHold(@Body() body: unknown): Promise<Booking> {
    const cmd = parse(createHoldSchema, body);
    return this.bookings.createHold(cmd);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<Booking> {
    const { paymentRef } = parse(confirmSchema, body);
    return this.bookings.confirm(id, paymentRef);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<Booking> {
    const { cancelledBy, reason } = parse(cancelSchema, body);
    return this.bookings.cancel(id, cancelledBy, reason ?? null);
  }

  @Post(':id/check-in')
  @HttpCode(200)
  checkIn(@Param('id', ParseUUIDPipe) id: string): Promise<Booking> {
    return this.bookings.checkIn(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id', ParseUUIDPipe) id: string): Promise<Booking> {
    return this.bookings.complete(id);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Booking> {
    return this.bookings.getById(id);
  }
}
