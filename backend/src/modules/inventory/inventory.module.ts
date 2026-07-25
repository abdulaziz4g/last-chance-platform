import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { UnitService } from './application/unit.service';
import { UnitRepository } from './infrastructure/unit.repository';

@Module({
  controllers: [InventoryController],
  providers: [UnitService, UnitRepository],
  exports: [UnitService],
})
export class InventoryModule {}
