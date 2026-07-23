import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://lastchance:lastchance_dev_only@localhost:5432/lastchance'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  OPENSEARCH_URL: z.string().url().default('http://localhost:9200'),
  LOG_PRETTY: z.string().optional(),
  /** HMAC secret for the dev MOCK payment provider's webhooks. */
  MOCK_WEBHOOK_SECRET: z.string().default('mock_dev_secret'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Delay before executing a created payout (real platforms hold days). */
  PAYOUT_EXECUTE_DELAY_MS: z.coerce.number().int().min(0).default(3000),
  JWT_SECRET: z.string().min(16).default('dev_jwt_secret_change_me_32chars'),
  JWT_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
});

/**
 * Typed, validated configuration. Fails fast at boot on malformed env —
 * a misconfigured pod must crash-loop, not limp.
 */
@Injectable()
export class AppConfigService {
  private readonly env = envSchema.parse(process.env);

  get nodeEnv(): 'development' | 'test' | 'production' {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get openSearchUrl(): string {
    return this.env.OPENSEARCH_URL;
  }

  /** Host/port form for BullMQ, which manages its own ioredis connections. */
  get redisConnection(): { host: string; port: number } {
    const url = new URL(this.env.REDIS_URL);
    return { host: url.hostname, port: Number(url.port || 6379) };
  }

  get logPretty(): boolean {
    return Boolean(this.env.LOG_PRETTY) && this.nodeEnv !== 'production';
  }

  get mockWebhookSecret(): string {
    return this.env.MOCK_WEBHOOK_SECRET;
  }

  get stripeSecretKey(): string | undefined {
    return this.env.STRIPE_SECRET_KEY;
  }

  get stripeWebhookSecret(): string | undefined {
    return this.env.STRIPE_WEBHOOK_SECRET;
  }

  get payoutExecuteDelayMs(): number {
    return this.env.PAYOUT_EXECUTE_DELAY_MS;
  }

  get jwtSecret(): string {
    if (
      this.nodeEnv === 'production' &&
      this.env.JWT_SECRET === 'dev_jwt_secret_change_me_32chars'
    ) {
      throw new Error('JWT_SECRET must be set in production');
    }
    return this.env.JWT_SECRET;
  }

  get jwtTtlSeconds(): number {
    return this.env.JWT_TTL_SECONDS;
  }

  /** Header-based actor fallback: development convenience ONLY. */
  get authDevFallback(): boolean {
    return this.nodeEnv !== 'production';
  }
}
