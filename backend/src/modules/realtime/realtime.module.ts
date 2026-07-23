import { Module } from '@nestjs/common';
import { AvailabilityGateway } from './availability.gateway';

@Module({
  providers: [AvailabilityGateway],
})
export class RealtimeModule {}
