import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { UnitService } from './application/unit.service';
import { UnitRepository } from './infrastructure/unit.repository';
import { MapSearchService } from './application/map-search.service';
import { MapSearchRepository } from './infrastructure/map-search.repository';

@Module({
  controllers: [InventoryController],
  providers: [UnitService, UnitRepository, MapSearchService, MapSearchRepository],
  exports: [UnitService, MapSearchService],
})
export class InventoryModule {}
