import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public, RateLimit } from '../../common/auth/decorators';
import { UnitService } from './application/unit.service';
import { MapSearchService } from './application/map-search.service';
import type { UnitDetail } from './domain/types';
import type { MapPin } from './domain/map-types';

@Controller('units')
export class InventoryController {
  constructor(
    private readonly units: UnitService,
    private readonly mapSearch: MapSearchService,
  ) {}

  /**
   * Public: viewport search for the interactive map.
   *
   * Declared BEFORE the ':id' route. Fastify's router prefers static segments
   * over parametric ones so the order is not strictly load-bearing, but a
   * reader should not have to know that to be sure '/units/map-search' is not
   * being parsed as a unit id.
   *
   * Rate limit is tighter than the detail route because a map drag fires these
   * continuously — the client is expected to debounce, and this is what happens
   * when it does not.
   */
  @Public()
  @RateLimit(60, 60)
  @Get('map-search')
  mapSearchUnits(
    @Query() query: Record<string, string | undefined>,
  ): Promise<{ pins: MapPin[]; truncated: boolean }> {
    return this.mapSearch.search(query);
  }

  /** Public: everything a guest needs to decide on one unit. */
  @Public()
  @RateLimit(120, 60)
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<UnitDetail> {
    return this.units.getPublicDetail(id);
  }
}
