import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './application/moderation.service';
import { ModerationFsmEngine } from './application/moderation-fsm.engine';
import { ModerationRepository } from './infrastructure/moderation.repository';
import { MediaModule } from '../media/media.module';
import { SearchModule } from '../search/search.module';

@Module({
  // MediaModule for STORAGE_PORT (documents are streamed, not published);
  // SearchModule so a decision can push the listing into or out of the index.
  imports: [MediaModule, SearchModule],
  controllers: [ModerationController],
  providers: [ModerationService, ModerationFsmEngine, ModerationRepository],
  exports: [ModerationService, ModerationFsmEngine],
})
export class ModerationModule {}
