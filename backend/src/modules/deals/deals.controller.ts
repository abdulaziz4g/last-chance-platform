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
import { z } from 'zod';
import { parseWith } from '../../common/validation';
import { Public, Roles, RateLimit } from '../../common/auth/decorators';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { DealService } from './application/deal.service';
import { FlashDeal, FlashDealView } from './domain/types';
import type { Booking } from '../booking/domain/types';

const createDealSchema = z.object({
  unitId: z.string().uuid(),
  title: z.string().min(1).max(140),
  discountPct: z.number().min(5).max(90),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  quantityTotal: z.number().int().min(1).max(1000),
  applicableStayFrom: z.coerce.date().nullish(),
  applicableStayTo: z.coerce.date().nullish(),
});

const claimSchema = z.object({
  guestId: z.string().uuid(),
  bookingType: z.enum(['HOURLY', 'NIGHTLY']),
  checkInUtc: z.coerce.date(),
  checkOutUtc: z.coerce.date(),
  guestsCount: z.number().int().min(1).max(50),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealService) {}

  /** Public: the live flash-deal feed (guests browse before signing in). */
  @Public()
  @Get('active')
  active(@Query() query: unknown): Promise<FlashDealView[]> {
    const { limit } = parseWith(listSchema, query);
    return this.deals.listActive(limit);
  }

  /** Host/admin: create a flash deal on one of their units. */
  @Roles('HOST', 'ADMIN')
  @Post()
  @HttpCode(201)
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Promise<FlashDeal> {
    const cmd = parseWith(createDealSchema, body);
    // createdBy comes from the verified token in production; the dev/no-JWT
    // path passes null and the repository resolves the unit's owning host.
    return this.deals.create({
      unitId: cmd.unitId,
      createdBy: req.authClaims?.sub ?? null,
      title: cmd.title,
      discountPct: cmd.discountPct,
      startsAt: cmd.startsAt,
      endsAt: cmd.endsAt,
      quantityTotal: cmd.quantityTotal,
      applicableStayFrom: cmd.applicableStayFrom ?? null,
      applicableStayTo: cmd.applicableStayTo ?? null,
    });
  }

  /** Guest: claim a deal — places a discounted 10-minute hold. Authenticated
   *  + rate-limited (flash deals are exactly where a bot would pile on). */
  @RateLimit(20, 60)
  @Post(':id/claim')
  @HttpCode(201)
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<Booking> {
    const cmd = parseWith(claimSchema, body);
    return this.deals.claim({
      dealId: id,
      guestId: cmd.guestId,
      bookingType: cmd.bookingType,
      checkInUtc: cmd.checkInUtc,
      checkOutUtc: cmd.checkOutUtc,
      guestsCount: cmd.guestsCount,
    });
  }
}
