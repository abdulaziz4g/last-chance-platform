import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseWith } from '../../common/validation';
import { Roles } from '../../common/auth/decorators';
import {
  AdminOverview,
  BookingListItem,
  ReportingRepository,
} from './reporting.repository';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const hostQuery = z.object({ hostId: z.string().uuid().optional() });

/**
 * Dashboard read endpoints (host + admin), ADMIN-gated. Hosts get their own
 * HOST-scoped surface when the console grows real host auth; today the web
 * console operates with the ADMIN identity. Internal — not in the public
 * OpenAPI document.
 */
@Roles('ADMIN')
@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingRepository) {}

  @Get('admin/overview')
  overview(): Promise<AdminOverview> {
    return this.reporting.adminOverview();
  }

  @Get('admin/bookings')
  bookings(@Query() query: unknown): Promise<BookingListItem[]> {
    const { limit } = parseWith(listQuery, query);
    return this.reporting.recentBookings(limit);
  }

  @Get('admin/payments')
  payments(@Query() query: unknown): Promise<Record<string, unknown>[]> {
    const { limit } = parseWith(listQuery, query);
    return this.reporting.recentPayments(limit);
  }

  @Get('admin/payouts')
  payouts(@Query() query: unknown): Promise<Record<string, unknown>[]> {
    const { limit } = parseWith(listQuery, query);
    return this.reporting.recentPayouts(limit);
  }

  @Get('admin/ledger')
  async ledger(
    @Query() query: unknown,
  ): Promise<{ balances: unknown[]; entries: unknown[] }> {
    const { limit } = parseWith(listQuery, query);
    const [balances, entries] = await Promise.all([
      this.reporting.ledgerBalances(),
      this.reporting.recentLedgerEntries(limit),
    ]);
    return { balances, entries };
  }

  @Get('admin/webhooks')
  webhooks(@Query() query: unknown): Promise<Record<string, unknown>[]> {
    const { limit } = parseWith(listQuery, query);
    return this.reporting.recentWebhookEvents(limit);
  }

  @Get('host/overview')
  host(@Query() query: unknown): Promise<Record<string, unknown> | null> {
    const { hostId } = parseWith(hostQuery, query);
    return this.reporting.hostOverview(hostId);
  }
}
