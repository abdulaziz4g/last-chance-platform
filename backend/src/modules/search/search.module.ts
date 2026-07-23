import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './application/search.service';
import { UnitIndexer } from './infrastructure/unit-indexer.service';
import { rootLogger } from '../../common/logger/logger';

const log = rootLogger.child({ component: 'SearchModule' });

@Module({
  controllers: [SearchController],
  providers: [SearchService, UnitIndexer],
  exports: [UnitIndexer],
})
export class SearchModule implements OnApplicationBootstrap {
  constructor(private readonly indexer: UnitIndexer) {}

  /** Ensure the index+alias exist at boot. Non-fatal: a search-cluster
   *  outage must not stop the API from serving bookings. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.indexer.ensureIndex();
    } catch (err) {
      log.error({ err }, 'Search index bootstrap failed (search degraded)');
    }
  }
}
