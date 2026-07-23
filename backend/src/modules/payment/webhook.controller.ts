import {
  Controller,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { WebhookService } from './application/webhook.service';
import { PAYMENT_PROVIDERS, PaymentProviderName } from './domain/types';
import { ValidationFailedError } from '../../common/errors/domain-errors';
import { Public, RateLimit } from '../../common/auth/decorators';

/**
 * Provider webhook intake. Contract with PSPs:
 *   - answer fast (heavy work is queued, never done inline)
 *   - 2xx only after the event is durably recorded
 *   - 400 on signature failure so providers alert on misconfiguration
 * Idempotency: replays of a recorded event id are acknowledged 200 and
 * never reprocessed (UNIQUE provider+event_id at the inbox).
 */
// Public by design: PSPs cannot send our JWTs — the HMAC signature IS the
// authentication. Generous rate budget; bursts of legitimate retries happen.
@Public()
@RateLimit(600, 60)
@Controller('webhooks/payments')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post(':provider')
  @HttpCode(200)
  async intake(
    @Param('provider') providerParam: string,
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ received: boolean; duplicate: boolean }> {
    const provider = providerParam.toUpperCase() as PaymentProviderName;
    if (!(PAYMENT_PROVIDERS as readonly string[]).includes(provider)) {
      throw new ValidationFailedError(`Unknown payment provider ${providerParam}`);
    }
    if (!req.rawBody) {
      throw new ValidationFailedError('Missing request body');
    }

    const result = await this.webhooks.intake(
      provider,
      req.rawBody,
      req.headers,
    );
    if (!result.accepted) {
      reply.status(400);
    }
    return { received: result.accepted, duplicate: result.duplicate };
  }
}
