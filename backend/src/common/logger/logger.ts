import pino from 'pino';

/**
 * Single structured-log root for the process. Child loggers per component
 * (`rootLogger.child({ component: 'BookingService' })`) keep every line
 * queryable in the log pipeline. Pretty-printing is opt-in for local dev.
 */
export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'lastchance-backend' },
  transport:
    process.env.LOG_PRETTY && process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
});
