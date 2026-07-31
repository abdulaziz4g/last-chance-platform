import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { EscrowAdminService } from './application/escrow-admin.service';
import { Roles } from '../../common/auth/decorators';
import { ValidationFailedError } from '../../common/errors/domain-errors';
import { LEDGER_ACCOUNTS } from './domain/types';
import type { Payout } from './domain/types';

const adjustSchema = z.object({
  fromAccount: z.enum(LEDGER_ACCOUNTS),
  toAccount: z.enum(LEDGER_ACCOUNTS),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  reason: z.string().min(10).max(2000),
  bookingId: z.string().uuid().optional(),
  hostId: z.string().uuid().optional(),
});

const reasonSchema = z.object({ reason: z.string().min(10).max(2000) });

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationFailedError('Invalid escrow admin request', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
};

/**
 * Operator intervention in the money pipeline. Every route is ADMIN-only and
 * every one demands a written reason.
 *
 * Nothing here edits history: adjustments are compensating entries and payout
 * interventions are state transitions with a CAS. See EscrowAdminService for
 * why that is the design rather than a workaround.
 */
@Controller('admin/escrow')
export class EscrowAdminController {
  constructor(private readonly escrow: EscrowAdminService) {}

  @Post('adjustments')
  @Roles('ADMIN')
  async adjust(@Body() body: unknown): Promise<{ entryGroupId: string }> {
    const cmd = parse(adjustSchema, body);
    return this.escrow.adjust(cmd);
  }

  @Post('payouts/:payoutId/hold')
  @Roles('ADMIN')
  async hold(
    @Param('payoutId') payoutId: string,
    @Body() body: unknown,
  ): Promise<Payout> {
    return this.escrow.hold(payoutId, parse(reasonSchema, body).reason);
  }

  @Post('payouts/:payoutId/release')
  @Roles('ADMIN')
  async release(
    @Param('payoutId') payoutId: string,
    @Body() body: unknown,
  ): Promise<Payout> {
    return this.escrow.release(payoutId, parse(reasonSchema, body).reason);
  }

  @Post('payouts/:payoutId/retry')
  @Roles('ADMIN')
  async retry(
    @Param('payoutId') payoutId: string,
    @Body() body: unknown,
  ): Promise<Payout> {
    return this.escrow.retry(payoutId, parse(reasonSchema, body).reason);
  }
}
