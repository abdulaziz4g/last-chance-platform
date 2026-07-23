import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { AppConfigService } from '../../../config/config.service';
import {
  BOOKING_EXPIRY_QUEUE,
  ExpireHoldJob,
  QUEUE_NAMES,
} from '../../../infrastructure/queue/queue.module';
import { BookingService } from '../application/booking.service';
import { BookingRepository } from '../infrastructure/booking.repository';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'BookingExpiryProcessor' });

const SWEEP_JOB = 'sweep';
const SWEEP_EVERY_MS = 60_000;

/**
 * Hold-expiry pipeline, two layers deep:
 *   - Per-booking delayed job (precise, fired ~2s after hold_expires_at).
 *   - Repeatable sweeper every minute calling fn_expire_stale_holds() —
 *     catches anything the queue lost (Redis restart, dropped job).
 * Both paths are idempotent, so firing twice is harmless.
 */
@Injectable()
export class BookingExpiryProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker!: Worker<ExpireHoldJob>;

  constructor(
    private readonly config: AppConfigService,
    private readonly bookingService: BookingService,
    private readonly bookingRepo: BookingRepository,
    @Inject(BOOKING_EXPIRY_QUEUE)
    private readonly queue: Queue<ExpireHoldJob>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.worker = new Worker<ExpireHoldJob>(
      QUEUE_NAMES.bookingExpiry,
      (job) => this.process(job),
      {
        connection: {
          ...this.config.redisConnection,
          maxRetriesPerRequest: null,
        },
        concurrency: 5,
      },
    );
    this.worker.on('failed', (job, err) =>
      log.error({ jobId: job?.id, err }, 'Expiry job failed'),
    );

    // Upsert the safety-net sweeper (deduped across app instances by jobId).
    await this.queue.add(
      SWEEP_JOB,
      { bookingId: '' },
      {
        repeat: { every: SWEEP_EVERY_MS },
        jobId: SWEEP_JOB,
      },
    );
  }

  private async process(job: Job<ExpireHoldJob>): Promise<void> {
    if (job.name === SWEEP_JOB) {
      const expired = await this.bookingRepo.sweepStaleHolds();
      if (expired.length > 0) {
        log.warn(
          { count: expired.length, bookingIds: expired },
          'Sweeper expired holds the delayed jobs missed',
        );
      }
      return;
    }
    await this.bookingService.expireHold(job.data.bookingId);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
