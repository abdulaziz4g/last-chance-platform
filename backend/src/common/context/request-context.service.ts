import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActorType } from '../../modules/booking/domain/types';

export interface RequestContext {
  requestId: string;
  actorId?: string;
  actorType: ActorType;
}

/**
 * AsyncLocalStorage-backed request context. HTTP requests enter it via the
 * Fastify onRequest hook (main.ts); background workers enter it explicitly
 * with an actorType of SYSTEM. The database layer reads it to stamp
 * `SET LOCAL app.actor_id / app.actor_type / app.request_id` on every
 * transaction, which is what attributes audit and FSM-history rows in the DB.
 */
@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run<T>(ctx: RequestContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  /**
   * Bind a store to the CURRENT async execution scope (rest of this request).
   * Used by ContextGuard: `run(ctx, done)` inside a Fastify hook does NOT
   * survive into the route handler (Fastify awaits a promise created outside
   * the run scope), which silently attributed every request to SYSTEM —
   * caught by the Phase-6 attribution smoke test.
   */
  enterWith(ctx: RequestContext): void {
    this.als.enterWith(ctx);
  }

  current(): RequestContext | undefined {
    return this.als.getStore();
  }

  /** Patch the live store in place — how the auth guard promotes the actor
   *  from anonymous to the verified JWT identity mid-request. */
  update(patch: Partial<RequestContext>): void {
    const store = this.als.getStore();
    if (store) Object.assign(store, patch);
  }
}
