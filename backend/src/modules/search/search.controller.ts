import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseWith } from '../../common/validation';
import { Public, Roles, RateLimit } from '../../common/auth/decorators';
import { SearchService } from './application/search.service';
import { UnitIndexer } from './infrastructure/unit-indexer.service';
import { SearchQuery, SearchResults } from './domain/types';

const searchSchema = z
  .object({
    text: z.string().max(200).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(0.1).max(500).optional(),
    city: z.string().max(120).optional(),
    mode: z.enum(['HOURLY', 'NIGHTLY']).optional(),
    guests: z.coerce.number().int().min(1).max(50).optional(),
    minPriceMinor: z.coerce.number().int().min(0).optional(),
    maxPriceMinor: z.coerce.number().int().min(0).optional(),
    amenities: z
      .union([z.string(), z.array(z.string())])
      .transform((v) => (Array.isArray(v) ? v : v.split(',')).filter(Boolean))
      .optional(),
    instantBookOnly: z.coerce.boolean().optional(),
    checkInUtc: z.string().datetime().optional(),
    checkOutUtc: z.string().datetime().optional(),
    sort: z
      .enum(['relevance', 'price_asc', 'price_desc', 'rating', 'distance'])
      .optional(),
    page: z.coerce.number().int().min(1).max(500).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  // lat/lon must travel together; a stay window needs both ends.
  .refine((q) => (q.lat == null) === (q.lon == null), {
    message: 'lat and lon must be provided together',
  })
  .refine((q) => (q.checkInUtc == null) === (q.checkOutUtc == null), {
    message: 'checkInUtc and checkOutUtc must be provided together',
  });

@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly indexer: UnitIndexer,
  ) {}

  /** Public discovery — no auth (guests browse before signing in). */
  @Public()
  @RateLimit(120, 60)
  @Get('units')
  searchUnits(@Query() query: unknown): Promise<SearchResults> {
    return this.search.search(parseWith(searchSchema, query) as SearchQuery);
  }

  /** POST variant for rich bodies (amenity arrays, complex filters). */
  @Public()
  @RateLimit(120, 60)
  @Post('units')
  @HttpCode(200)
  searchUnitsPost(@Body() body: unknown): Promise<SearchResults> {
    return this.search.search(parseWith(searchSchema, body) as SearchQuery);
  }

  /** Admin operational endpoint: full rebuild of the index from PostgreSQL. */
  @Roles('ADMIN')
  @Post('reindex')
  @HttpCode(200)
  async reindex(): Promise<{ indexed: number }> {
    const indexed = await this.indexer.reindexAll();
    return { indexed };
  }
}
