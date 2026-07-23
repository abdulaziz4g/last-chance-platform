import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { DealsController } from './deals.controller';
import { DealService } from './application/deal.service';
import { DealRepository } from './infrastructure/deal.repository';
import { DealEventsPublisher } from './events/deal-events.publisher';
import { DealLifecycleProcessor } from './workers/deal-lifecycle.processor';

@Module({
  imports: [BookingModule], // for BookingService (the discounted-hold path)
  controllers: [DealsController],
  providers: [
    DealService,
    DealRepository,
    DealEventsPublisher,
    DealLifecycleProcessor,
  ],
  exports: [DealService],
})
export class DealsModule {}
