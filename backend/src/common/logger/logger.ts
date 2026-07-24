import { trace, context } from '@opentelemetry/api';
import pino from 'pino';

export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'lastchance-backend' },
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) return {};
    const ctx = span.spanContext();
    return { traceId: ctx.traceId, spanId: ctx.spanId };
  },
  transport:
    process.env.LOG_PRETTY && process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
});
