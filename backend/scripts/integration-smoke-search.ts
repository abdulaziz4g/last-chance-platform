/**
 * OpenSearch discovery smoke — full stack, live:
 *   fixtures (3 units across 2 cities, varied amenities/rates)
 *   -> reindex from PostgreSQL
 *   -> geo radius search, text search, amenity + price facets/filters
 *   -> TWO-STAGE availability: book a unit, confirm it, then prove the
 *      windowed search drops it while the plain search still shows it.
 *
 * Usage: node node_modules/ts-node/dist/bin.js scripts/integration-smoke-search.ts
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/infrastructure/database/database.service';
import { RequestContextService } from '../src/common/context/request-context.service';
import { UnitIndexer } from '../src/modules/search/infrastructure/unit-indexer.service';
import { SearchService } from '../src/modules/search/application/search.service';
import { BookingService } from '../src/modules/booking/application/booking.service';

let passed = 0;
let failed = 0;
const pass = (n: string): void => {
  passed++;
  console.log(`  PASS  ${n}`);
};
const fail = (n: string, d?: unknown): void => {
  failed++;
  console.error(`  FAIL  ${n}`, d ?? '');
};
const assert = (c: boolean, n: string, d?: unknown): void =>
  c ? pass(n) : fail(n, d);

function tomorrow(h: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(h, 0, 0, 0);
  return d;
}

async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['error', 'warn'], abortOnError: false, rawBody: true },
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();

  const db = app.get(DatabaseService);
  const ctx = app.get(RequestContextService);
  const indexer = app.get(UnitIndexer);
  const search = app.get(SearchService);
  const bookings = app.get(BookingService);

  await ctx.run(
    { requestId: `search-${randomUUID()}`, actorType: 'SYSTEM' },
    async () => {
      const tag = Date.now();
      const hostUserId = randomUUID();
      const guestId = randomUUID();
      const propRiyadh = randomUUID();
      const propJeddah = randomUUID();
      // Riyadh units
      const unitLux = randomUUID(); // pool+wifi, pricey
      const unitStd = randomUUID(); // wifi only, cheap
      // Jeddah unit
      const unitSea = randomUUID(); // wifi+seaview

      const cityTag = `SearchCity${tag}`; // unique city keys isolate this run
      const riyadhCity = `${cityTag}RUH`;
      const jeddahCity = `${cityTag}JED`;

      await db.query(
        `INSERT INTO users (id, email, full_name, auth_provider) VALUES
         ($1, $3, 'Search Host', 'google'), ($2, $4, 'Search Guest', 'google')`,
        [hostUserId, guestId, `sh-${tag}@t.local`, `sg-${tag}@t.local`],
      );
      await db.query(
        `INSERT INTO host_profiles (user_id, display_name) VALUES ($1, 'Search Host')`,
        [hostUserId],
      );
      // Riyadh ~ (24.71, 46.67); Jeddah ~ (21.54, 39.17) — ~850km apart.
      await db.query(
        `INSERT INTO properties (id, host_id, name, slug, property_type, status, city, country_code, location, amenities)
         VALUES
         ($1,$3,'Riyadh Tower',$4,'APARTHOTEL','ACTIVE',$6,'SA',ST_SetSRID(ST_MakePoint(46.67,24.71),4326)::geography,'[]'),
         ($2,$3,'Jeddah Corniche',$5,'RESORT','ACTIVE',$7,'SA',ST_SetSRID(ST_MakePoint(39.17,21.54),4326)::geography,'[]')`,
        [propRiyadh, propJeddah, hostUserId, `rt-${tag}`, `jc-${tag}`, riyadhCity, jeddahCity],
      );

      const mkUnit = (
        id: string,
        prop: string,
        name: string,
        hourly: number,
        nightly: number,
      ): Promise<unknown> =>
        db.query(
          `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                              max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                              turnaround_minutes, status)
           VALUES ($1,$2,$3,'STUDIO',true,true,4,'SAR',$5::bigint,$4::bigint,30,'ACTIVE')`,
          [id, prop, name, hourly, nightly],
        );
      await mkUnit(unitLux, propRiyadh, 'Lux Suite', 20000, 80000);
      await mkUnit(unitStd, propRiyadh, 'Standard Room', 6000, 24000);
      await mkUnit(unitSea, propJeddah, 'Sea View', 15000, 60000);

      // Amenities live on properties in the schema; set per property.
      await db.query(
        `UPDATE properties SET amenities = $2::jsonb WHERE id = $1`,
        [propRiyadh, JSON.stringify(['wifi', 'pool', 'parking'])],
      );
      await db.query(
        `UPDATE properties SET amenities = $2::jsonb WHERE id = $1`,
        [propJeddah, JSON.stringify(['wifi', 'seaview'])],
      );

      // ---- index -----------------------------------------------------------
      const indexed = await indexer.reindexAll();
      assert(indexed >= 3, `reindexed all active units (${indexed} docs)`);

      // ---- geo radius: Riyadh anchor, 50km -> both Riyadh units, not Jeddah -
      const geo = await search.search({
        lat: 24.71,
        lon: 46.67,
        radiusKm: 50,
        city: riyadhCity,
      });
      assert(
        geo.items.length === 2 &&
          geo.items.every((i) => i.city === riyadhCity),
        `geo radius returns only the 2 Riyadh units (${geo.items.length})`,
      );
      assert(
        geo.items.every((i) => i.distanceKm != null && i.distanceKm < 50),
        'each result carries a distance under the radius',
      );

      // ---- wide radius reaches Jeddah too ---------------------------------
      const wide = await search.search({
        lat: 24.71,
        lon: 46.67,
        radiusKm: 1000,
        text: 'corniche',
      });
      assert(
        wide.items.some((i) => i.city === jeddahCity),
        'text search "corniche" + wide radius finds the Jeddah unit',
      );

      // ---- price filter (hourly) ------------------------------------------
      const cheap = await search.search({
        city: riyadhCity,
        mode: 'HOURLY',
        maxPriceMinor: 10000,
      });
      assert(
        cheap.items.length === 1 && cheap.items[0].unitId === unitStd,
        'hourly price ceiling filters to the standard room only',
      );

      // ---- amenity facet + filter -----------------------------------------
      const pool = await search.search({ city: riyadhCity, amenities: ['pool'] });
      assert(
        pool.items.length === 2,
        `amenity filter pool -> 2 Riyadh units (${pool.items.length})`,
      );
      const facetKeys = pool.facets.amenities.map((f) => f.key);
      assert(
        facetKeys.includes('wifi') && facetKeys.includes('pool'),
        'amenity facets are returned',
        facetKeys,
      );

      // ---- TWO-STAGE availability -----------------------------------------
      // Book the standard room for a window, confirm it (blocks inventory).
      const checkIn = tomorrow(10);
      const checkOut = tomorrow(13);
      const hold = await bookings.createHold({
        guestId,
        unitId: unitStd,
        bookingType: 'HOURLY',
        checkInUtc: checkIn,
        checkOutUtc: checkOut,
        guestsCount: 2,
      });
      await bookings.confirm(hold.id, 'search-smoke');

      // Plain search still lists it (availability not indexed).
      const plain = await search.search({ city: riyadhCity, mode: 'HOURLY' });
      assert(
        plain.items.some((i) => i.unitId === unitStd) &&
          !plain.availabilityChecked,
        'plain search still lists the booked unit (no window supplied)',
      );

      // Windowed search over the SAME window drops it (DB post-filter).
      const windowed = await search.search({
        city: riyadhCity,
        mode: 'HOURLY',
        checkInUtc: checkIn.toISOString(),
        checkOutUtc: checkOut.toISOString(),
      });
      assert(windowed.availabilityChecked, 'windowed search ran the DB post-filter');
      assert(
        !windowed.items.some((i) => i.unitId === unitStd),
        'two-stage: booked unit is EXCLUDED for its booked window',
      );
      assert(
        windowed.items.some((i) => i.unitId === unitLux) &&
          windowed.items.every((i) => i.available === true),
        'two-stage: the free unit remains and is flagged available',
      );

      // A non-overlapping window brings it back.
      const laterIn = tomorrow(20);
      const laterOut = tomorrow(22);
      const later = await search.search({
        city: riyadhCity,
        mode: 'HOURLY',
        checkInUtc: laterIn.toISOString(),
        checkOutUtc: laterOut.toISOString(),
      });
      assert(
        later.items.some((i) => i.unitId === unitStd),
        'two-stage: same unit is available again for a non-overlapping window',
      );

      // ---- incremental index maintenance ----------------------------------
      await db.query(`UPDATE units SET status = 'INACTIVE' WHERE id = $1`, [unitSea]);
      await indexer.indexUnit(unitSea);
      const afterDeactivate = await search.search({ text: 'corniche', lat: 21.54, lon: 39.17, radiusKm: 50 });
      assert(
        !afterDeactivate.items.some((i) => i.unitId === unitSea),
        'incremental: deactivated unit evicted from the index',
      );
    },
  );

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode ?? 0), 1500);
}

main().catch((err) => {
  try {
    require('node:fs').writeSync(2, `SMOKE RUN CRASHED: ${err?.stack ?? err}\n`);
  } catch {
    console.error('SMOKE RUN CRASHED:', err);
  }
  setTimeout(() => process.exit(1), 1500);
});
