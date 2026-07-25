import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { BookingService } from './application/booking.service';
import { Booking } from './domain/types';
import { parseWith as parse } from '../../common/validation';
import { RateLimit } from '../../common/auth/decorators';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { UnauthorizedError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/config.service';
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
  constructor(
    private readonly bookings: BookingService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * The caller's real role on this booking, resolved from the token against
   * the booking's guest and host.
   *
   * With no token the JwtAuthGuard has already either rejected the request
   * (production) or waved it through under the documented dev fallback. In
   * that second case we treat the caller as an operator, exactly as the rest
   * of the console's x-actor-type path does — rather than inventing a subject
   * we do not have. Production never reaches that branch.
   */
  private async actorFor(
    bookingId: string,
    req: AuthenticatedRequest,
  ): Promise<'GUEST' | 'HOST' | 'ADMIN'> {
    if (!req.authClaims) {
      if (this.config.authDevFallback) return 'ADMIN';
      throw new UnauthorizedError('Bearer token required');
    }
    return this.bookings.authorizeActor(
      bookingId,
      req.authClaims.sub,
      req.authClaims.role === 'ADMIN',
    );
  }

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

  /**
   * Who cancelled is derived from the verified token, never from the body —
   * trusting a client-supplied `cancelledBy` would let any caller cancel any
   * booking and label the act however it liked.
   */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Promise<Booking> {
    const { reason } = parse(cancelSchema, body);
    const actor = await this.actorFor(id, req);
    return this.bookings.cancel(id, actor, reason ?? null);
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

  @Get('mine')
  mine(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ): Promise<Booking[]> {
    if (!req.authClaims) throw new UnauthorizedError('Bearer token required');
    return this.bookings.listByGuest(
      req.authClaims.sub,
      Math.min(Number(limit) || 50, 100),
    );
  }

  /** Readable only by its guest, its host, or an admin. */
  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Booking> {
    await this.actorFor(id, req);
    return this.bookings.getById(id);
  }
}
