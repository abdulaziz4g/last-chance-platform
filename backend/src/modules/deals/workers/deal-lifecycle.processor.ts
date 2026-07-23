import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AppConfigService } from '../../../config/config.service';
import {
  DEALS_QUEUE,
  DealsJobData,
  QUEUE_NAMES,
} from '../../../infrastructure/queue/queue.module';
import { DealService } from '../application/deal.service';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'DealLifecycleProcessor' });

const LIFECYCLE_JOB = 'lifecycle';
const EVERY_MS = 30_000;

/**
 * Drives flash-deal lifecycle: a repeatable job every 30s promotes SCHEDULED
 * deals whose window opened to ACTIVE, and ends ACTIVE/SCHEDULED deals whose
 * window closed. Idempotent (status-guarded UPDATEs) and deduped across pods
 * by the repeatable jobId. The DB SOLD_OUT auto-flip trigger handles the
 * inventory-exhaustion transition independently.
 */
@Injectable()
export class DealLifecycleProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker!: Worker<DealsJobData>;

  constructor(
    private readonly config: AppConfigService,
    private readonly deals: DealService,
    @Inject(DEALS_QUEUE) private readonly queue: Queue<DealsJobData>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.worker = new Worker<DealsJobData>(
      QUEUE_NAMES.deals,
      () => this.deals.runLifecycle().then(() => undefined),
      {
        connection: { ...this.config.redisConnection, maxRetriesPerRequest: null },
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, err) =>
      log.error({ jobId: job?.id, err }, 'Deal lifecycle job failed'),
    );

    await this.queue.add(
      LIFECYCLE_JOB,
      { tick: true },
      { repeat: { every: EVERY_MS }, jobId: LIFECYCLE_JOB },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
