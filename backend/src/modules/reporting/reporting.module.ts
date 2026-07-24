import { Module } from '@nestjs/common';
import { HostReportingController } from './host-reporting.controller';
import { ReportingController } from './reporting.controller';
import { ReportingRepository } from './reporting.repository';

@Module({
  controllers: [ReportingController, HostReportingController],
  providers: [ReportingRepository],
})
export class ReportingModule {}
