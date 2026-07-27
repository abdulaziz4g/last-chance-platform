import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DomainError } from '../errors/domain-errors';
import { RequestContextService } from '../context/request-context.service';
import { rootLogger } from '../logger/logger';

const log = rootLogger.child({ component: 'DomainExceptionFilter' });

/**
 * Single edge where errors become HTTP. Domain errors carry their own status
 * and machine-readable code; anything unrecognized is a 500 with no internal
 * detail leaked — the requestId lets support correlate with logs.
 */
@Injectable()
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly ctx: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = this.ctx.current()?.requestId;

    if (exception instanceof DomainError) {
      // Retry-After is the standard signal for a throttled caller, and the
      // only one a proxy, crawler or non-browser client will understand —
      // the JSON body is for our own UI.
      const retryAfter = exception.details?.retryAfterSec;
      if (exception.httpStatus === 429 && typeof retryAfter === 'number') {
        void reply.header('Retry-After', String(retryAfter));
      }
      void reply.status(exception.httpStatus).send({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      void reply.status(exception.getStatus()).send({
        error: {
          code: 'HTTP_ERROR',
          message: exception.message,
          requestId,
        },
      });
      return;
    }

    log.error({ err: exception, requestId }, 'Unhandled exception');
    void reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      },
    });
  }
}
