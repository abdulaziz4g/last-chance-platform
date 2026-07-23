import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';
import { AppConfigService } from '../../config/config.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { mapPgError } from '../../common/errors/pg-error.mapper';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'DatabaseService' });

// node-postgres returns int8 as string (it cannot know values fit a double).
// All our bigints are money in minor units — far below 2^53 — so parse to
// number with a hard guard: silently losing precision on money is not a risk
// we accept.
types.setTypeParser(types.builtins.INT8, (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`int8 value ${v} exceeds JS safe-integer range`);
  }
  return n;
});
// numeric(5,2) percentages — safe as float at this scale.
types.setTypeParser(types.builtins.NUMERIC, (v) => Number(v));

/**
 * Thin, deliberate data access layer over node-postgres. No ORM: the Phase 1
 * schema leans on generated columns, exclusion constraints, and custom
 * SQLSTATEs that ORMs fight; SQL stays the single source of truth.
 *
 * Every transaction is stamped with the request context via
 * `SET LOCAL app.actor_id / app.actor_type / app.request_id` — the contract
 * the DB triggers (audit, FSM history) rely on. See db/README.md.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(
    private readonly config: AppConfigService,
    private readonly ctx: RequestContextService,
  ) {}

  onModuleInit(): void {
    this.pool = new Pool({
      connectionString: this.config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // P99 < 150ms API budget: a query that runs 10s is already an incident.
      statement_timeout: 10_000,
    });
    this.pool.on('error', (err) =>
      log.error({ err }, 'Idle PostgreSQL client error'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<R extends QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<R>> {
    try {
      return await this.pool.query<R>(sql, params);
    } catch (e) {
      throw mapPgError(e);
    }
  }

  /**
   * Runs `fn` inside a transaction with the request context stamped.
   * Database errors are translated to domain errors at this boundary,
   * so callers catch UnitUnavailableError — never SQLSTATE '23P01'.
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.stampContext(client);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch((rollbackErr) =>
        log.error({ err: rollbackErr }, 'ROLLBACK failed'),
      );
      throw mapPgError(e);
    } finally {
      client.release();
    }
  }

  private async stampContext(client: PoolClient): Promise<void> {
    const ctx = this.ctx.current();
    if (!ctx) return; // DB-side accessors default the actor to SYSTEM
    await client.query(
      `SELECT set_config('app.actor_id', $1, true),
              set_config('app.actor_type', $2, true),
              set_config('app.request_id', $3, true)`,
      [ctx.actorId ?? '', ctx.actorType, ctx.requestId],
    );
  }

  async healthCheck(): Promise<boolean> {
    const res = await this.pool.query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  }
}
