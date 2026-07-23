import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { AppConfigService } from '../../../config/config.service';
import {
  PaymentsJobData,
  QUEUE_NAMES,
} from '../../../infrastructure/queue/queue.module';
import { WebhookService } from '../application/webhook.service';
import { PayoutService } from '../application/payout.service';
import { RefundService } from '../application/refund.service';
import { rootLogger } from '../../../common/logger/logger';

const log = rootLogger.child({ component: 'PaymentWorker' });

/**
 * Single worker for the payments queue; every handler is idempotent, so
 * BullMQ's at-least-once delivery with retries is safe by construction.
 */
@Injectable()
export class PaymentWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker!: Worker<PaymentsJobData>;

  constructor(
    private readonly config: AppConfigService,
    private readonly webhookService: WebhookService,
    private readonly payoutService: PayoutService,
    private readonly refundService: RefundService,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker<PaymentsJobData>(
      QUEUE_NAMES.payments,
      (job) => this.dispatch(job),
      {
        connection: {
          ...this.config.redisConnection,
          maxRetriesPerRequest: null,
        },
        concurrency: 10,
      },
    );
    this.worker.on('failed', (job, err) =>
      log.error({ jobId: job?.id, name: job?.name, err }, 'Payments job failed'),
    );
  }

  private async dispatch(job: Job<PaymentsJobData>): Promise<void> {
    switch (job.name) {
      case 'process-webhook':
        await this.webhookService.process(job.data.eventRecordId!);
        return;
      case 'create-payout':
        await this.payoutService.createForBooking(job.data.bookingId!);
        return;
      case 'execute-payout':
        await this.payoutService.executePayout(job.data.payoutId!);
        return;
      case 'create-refund':
        await this.refundService.createForBooking(
          job.data.bookingId!,
          job.data.reason ?? 'unspecified',
        );
        return;
      default:
        log.warn({ name: job.name }, 'Unknown payments job — dropping');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
