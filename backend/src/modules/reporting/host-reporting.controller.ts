import { Controller, Get, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { parseWith } from '../../common/validation';
import { Roles } from '../../common/auth/decorators';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { ReportingRepository } from './reporting.repository';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@Roles('HOST')
@Controller('host')
export class HostReportingController {
  constructor(private readonly reporting: ReportingRepository) {}

  @Get('overview')
  overview(@Req() req: AuthenticatedRequest) {
    const hostId = this.resolveHostId(req);
    return this.reporting.hostOverview(hostId);
  }

  @Get('bookings')
  bookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    const hostId = this.resolveHostId(req);
    const { limit, offset } = parseWith(listQuery, query);
    return this.reporting.recentBookings(limit, hostId, offset);
  }

  private resolveHostId(req: AuthenticatedRequest): string {
    const claims = req.authClaims;
    if (claims?.role === 'ADMIN') {
      return claims.sub;
    }
    if (claims?.actorType === 'HOST') {
      return claims.sub;
    }
    throw new ForbiddenError('Host profile required');
  }
}
