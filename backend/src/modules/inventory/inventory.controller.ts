import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Public, RateLimit } from '../../common/auth/decorators';
import { UnitService } from './application/unit.service';
import type { UnitDetail } from './domain/types';

@Controller('units')
export class InventoryController {
  constructor(private readonly units: UnitService) {}

  /** Public: everything a guest needs to decide on one unit. */
  @Public()
  @RateLimit(120, 60)
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<UnitDetail> {
    return this.units.getPublicDetail(id);
  }
}
