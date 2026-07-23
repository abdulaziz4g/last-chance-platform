import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './application/booking.service';
import { BookingFsmEngine } from './application/booking-fsm.engine';
import { PricingService } from './application/pricing.service';
import { BookingRepository } from './infrastructure/booking.repository';
import { UnitRepository } from './infrastructure/unit.repository';
import { BookingEventsPublisher } from './events/booking-events.publisher';
import { BookingExpiryProcessor } from './workers/booking-expiry.processor';

@Module({
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingFsmEngine,
    PricingService,
    BookingRepository,
    UnitRepository,
    BookingEventsPublisher,
    BookingExpiryProcessor,
  ],
  exports: [BookingService],
})
export class BookingModule {}
