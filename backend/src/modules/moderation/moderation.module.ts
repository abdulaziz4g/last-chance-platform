import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './application/moderation.service';
import { ModerationFsmEngine } from './application/moderation-fsm.engine';
import { ModerationRepository } from './infrastructure/moderation.repository';

@Module({
  controllers: [ModerationController],
  providers: [ModerationService, ModerationFsmEngine, ModerationRepository],
  exports: [ModerationService, ModerationFsmEngine],
})
export class ModerationModule {}
