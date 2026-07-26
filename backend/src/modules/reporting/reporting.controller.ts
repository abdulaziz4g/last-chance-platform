import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseWith } from '../../common/validation';
import { Roles } from '../../common/auth/decorators';
import {
  AdminOverview,
  BookingListItem,
  Paged,
  ReportingRepository,
} from './reporting.repository';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@Roles('ADMIN')
@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingRepository) {}

  @Get('admin/overview')
  overview(): Promise<AdminOverview> {
    return this.reporting.adminOverview();
  }

  @Get('admin/bookings')
  bookings(@Query() query: unknown): Promise<Paged<BookingListItem>> {
    const { limit, offset } = parseWith(listQuery, query);
    return this.reporting.recentBookings(limit, undefined, offset);
  }

  @Get('admin/payments')
  payments(@Query() query: unknown): Promise<Paged<Record<string, unknown>>> {
    const { limit, offset } = parseWith(listQuery, query);
    return this.reporting.recentPayments(limit, offset);
  }

  @Get('admin/payouts')
  payouts(@Query() query: unknown): Promise<Paged<Record<string, unknown>>> {
    const { limit, offset } = parseWith(listQuery, query);
    return this.reporting.recentPayouts(limit, offset);
  }

  /** Balances describe the whole ledger, so they are not paged with entries. */
  @Get('admin/ledger')
  async ledger(@Query() query: unknown): Promise<{
    balances: unknown[];
    entries: unknown[];
    total: number;
  }> {
    const { limit, offset } = parseWith(listQuery, query);
    const [balances, entries] = await Promise.all([
      this.reporting.ledgerBalances(),
      this.reporting.recentLedgerEntries(limit, offset),
    ]);
    return { balances, entries: entries.items, total: entries.total };
  }

  @Get('admin/webhooks')
  webhooks(@Query() query: unknown): Promise<Paged<Record<string, unknown>>> {
    const { limit, offset } = parseWith(listQuery, query);
    return this.reporting.recentWebhookEvents(limit, offset);
  }
}
