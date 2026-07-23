import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../config/config.service';

/**
 * BullMQ queue registry. Queue names and payload types live in one place so
 * producers and workers cannot drift.
 */
export const BOOKING_EXPIRY_QUEUE = Symbol('BOOKING_EXPIRY_QUEUE');
export const PAYMENTS_QUEUE = Symbol('PAYMENTS_QUEUE');
export const DEALS_QUEUE = Symbol('DEALS_QUEUE');
export const QUEUE_NAMES = {
  bookingExpiry: 'booking-expiry',
  payments: 'payments',
  deals: 'deals',
} as const;

export interface ExpireHoldJob {
  bookingId: string;
}

/** Deals queue: a single repeatable 'lifecycle' job activates/ends deals. */
export interface DealsJobData {
  tick?: boolean;
}

/**
 * Payments queue jobs (dispatch on job.name):
 *   'process-webhook' { eventRecordId }   webhook inbox row to apply
 *   'create-payout'   { bookingId }       checkout completed -> split escrow
 *   'execute-payout'  { payoutId }        run the provider transfer
 *   'create-refund'   { bookingId, reason } start refund at the provider
 */
export interface PaymentsJobData {
  eventRecordId?: string;
  bookingId?: string;
  payoutId?: string;
  reason?: string;
}

@Global()
@Module({
  providers: [
    {
      provide: BOOKING_EXPIRY_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(QUEUE_NAMES.bookingExpiry, {
          connection: {
            ...config.redisConnection,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 5000,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2_000 },
          },
        }),
    },
    {
      provide: PAYMENTS_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(QUEUE_NAMES.payments, {
          connection: {
            ...config.redisConnection,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 5000,
            attempts: 8,
            backoff: { type: 'exponential', delay: 3_000 },
          },
        }),
    },
    {
      provide: DEALS_QUEUE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Queue(QUEUE_NAMES.deals, {
          connection: {
            ...config.redisConnection,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            removeOnComplete: 200,
            removeOnFail: 500,
            attempts: 3,
          },
        }),
    },
  ],
  exports: [BOOKING_EXPIRY_QUEUE, PAYMENTS_QUEUE, DEALS_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(
    @Inject(BOOKING_EXPIRY_QUEUE) private readonly expiryQueue: Queue,
    @Inject(PAYMENTS_QUEUE) private readonly paymentsQueue: Queue,
    @Inject(DEALS_QUEUE) private readonly dealsQueue: Queue,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.expiryQueue.close(),
      this.paymentsQueue.close(),
      this.dealsQueue.close(),
    ]);
  }
}
