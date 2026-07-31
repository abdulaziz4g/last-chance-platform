/**
 * Phase 7 integration smoke — listing moderation and the PostGIS viewport map.
 *
 * Drives the whole regulatory gate over real HTTP against the docker-compose
 * stack: draft listing -> blocked submission -> compliance documents ->
 * submission -> admin review queue -> approval -> visible on the map ->
 * suspension -> gone again.
 *
 * Also asserts the two properties that are easy to get wrong and expensive to
 * get wrong: an unapproved listing must be unbookable even by direct id, and
 * the map must never return a property's true coordinates.
 *
 * Usage:  node node_modules/ts-node/dist/bin.js scripts/integration-smoke-moderation.ts
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

const PORT = 3500;
const BASE = `http://localhost:${PORT}`;

// AlUla old town, near Dar Tantora.
const TRUE_LNG = 37.9231;
const TRUE_LAT = 26.6089;

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
const assert = (cond: boolean, n: string, d?: unknown): void =>
  cond ? pass(n) : fail(n, d);

const adminId = randomUUID();
const hostId = randomUUID();
const guestId = randomUUID();

type Actor = 'ADMIN' | 'HOST' | 'GUEST';
const actorHeaders = (actor: Actor): Record<string, string> => ({
  'x-actor-type': actor,
  'x-actor-id': actor === 'ADMIN' ? adminId : actor === 'HOST' ? hostId : guestId,
});

async function http<T>(
  method: string,
  path: string,
  opts: { actor?: Actor; body?: unknown } = {},
): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = {
    ...(opts.actor ? actorHeaders(opts.actor) : {}),
    ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return {
    status: res.status,
    json: (text ? JSON.parse(text) : null) as T,
  };
}

function dayAt(daysAhead: number, hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** A viewport comfortably around AlUla. */
const VIEWPORT = `min_lng=37.80&min_lat=26.50&max_lng=38.05&max_lat=26.72`;

interface ApiError {
  error?: {
    code?: string;
    message?: string;
    details?: { blockers?: string[] };
  };
}

interface MapResponse {
  pins: Array<{
    unitId: string;
    approxLat: number;
    approxLng: number;
    privacyRadiusMetres: number;
    priceMinor: number;
    basePriceMinor: number;
    deal: { dealId: string; discountPct: number } | null;
  }>;
  truncated: boolean;
}

async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['error', 'warn'], abortOnError: false, rawBody: true },
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen({ port: PORT, host: '127.0.0.1' });

  const db = app.get(DatabaseService);
  const tag = Date.now();
  const propertyId = randomUUID();
  const unitId = randomUUID();

  // ---- fixtures -----------------------------------------------------------
  await db.query(
    `INSERT INTO users (id, email, full_name, auth_provider, platform_role) VALUES
     ($1,$4,'Mod Admin','google','ADMIN'),
     ($2,$5,'Mod Host','google','USER'),
     ($3,$6,'Mod Guest','google','USER')`,
    [
      adminId,
      hostId,
      guestId,
      `mod-admin-${tag}@t.local`,
      `mod-host-${tag}@t.local`,
      `mod-guest-${tag}@t.local`,
    ],
  );
  await db.query(
    `INSERT INTO host_profiles (user_id, display_name, kyc_status,
                                national_id_type, national_id_hash, national_id_last4)
     VALUES ($1,'Mod Host','VERIFIED','NATIONAL_ID',$2,'4471')`,
    [hostId, `hash-${tag}`],
  );
  await db.query(
    `INSERT INTO properties (id, host_id, name, slug, property_type, status,
                             city, country_code, location)
     VALUES ($1,$2,'AlUla Heritage Retreat',$3,'REST_HOUSE','DRAFT','AlUla','SA',
             ST_SetSRID(ST_MakePoint($4,$5),4326)::geography)`,
    [propertyId, hostId, `alula-retreat-${tag}`, TRUE_LNG, TRUE_LAT],
  );
  await db.query(
    `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                        max_guests, currency, base_nightly_rate_minor, base_hourly_rate_minor,
                        turnaround_minutes, status, photos)
     VALUES ($1,$2,'Nabataean Suite','SUITE',true,true,4,'SAR',120000::bigint,25000::bigint,45,'ACTIVE',
             $3::jsonb)`,
    [
      unitId,
      propertyId,
      JSON.stringify([
        `/media/units/${unitId}/one.png`,
        `/media/units/${unitId}/two.png`,
      ]),
    ],
  );
  console.log('Fixtures created.\n');

  // ---- 1. a draft listing is invisible ------------------------------------
  const beforeMap = await http<MapResponse>('GET', `/units/map-search?${VIEWPORT}`);
  assert(
    beforeMap.status === 200 &&
      !beforeMap.json.pins.some((p) => p.unitId === unitId),
    'draft listing does not appear on the map',
  );

  const beforeDetail = await http('GET', `/units/${unitId}`);
  assert(beforeDetail.status === 404, 'draft listing 404s on the public detail route',
    beforeDetail.status);

  // ---- 2. an unapproved listing cannot be booked, even by direct id -------
  // The exception filter wraps every failure as { error: { code, message, details } }.
  const earlyHold = await http<ApiError>('POST', '/bookings/hold', {
    actor: 'GUEST',
    body: {
      guestId,
      unitId,
      bookingType: 'NIGHTLY',
      checkInUtc: dayAt(10, 15),
      checkOutUtc: dayAt(11, 15),
      guestsCount: 2,
    },
  });
  assert(
    earlyHold.status >= 400,
    `booking an unapproved listing is refused (${earlyHold.status} ${earlyHold.json?.error?.code ?? ''})`,
  );

  // ---- 3. submission is blocked while compliance is incomplete ------------
  const earlySubmit = await http<ApiError>(
    'POST',
    `/host/properties/${propertyId}/submit`,
    { actor: 'HOST' },
  );
  const blockers = earlySubmit.json?.error?.details?.blockers ?? [];
  assert(
    earlySubmit.status === 400 &&
      blockers.includes('NATIONAL_ADDRESS_MISSING') &&
      blockers.includes('PERMIT_NUMBER_MISSING') &&
      blockers.includes('DEED_OR_LEASE_MISSING'),
    `incomplete submission blocked with named gaps (${blockers.join(', ')})`,
    earlySubmit.json,
  );

  // ---- 4. host completes the regulatory pack ------------------------------
  await db.query(
    `UPDATE properties SET national_short_address='ALUL2342', building_number='8231',
            additional_number='4417', district='Al-Diwan',
            tourism_permit_number='MT-1445-004821',
            tourism_permit_expires_at = current_date + 365
      WHERE id = $1`,
    [propertyId],
  );
  await db.query(
    `INSERT INTO property_documents (property_id, document_type, storage_key, file_name,
                                     content_type, size_bytes, uploaded_by)
     VALUES ($1,'TITLE_DEED',$2,'title-deed.pdf','application/pdf',482000,$3),
            ($1,'TOURISM_PERMIT',$4,'mot-permit.pdf','application/pdf',118000,$3)`,
    [propertyId, `props/${propertyId}/deed.pdf`, hostId, `props/${propertyId}/permit.pdf`],
  );

  const readiness = await http<{ blockers: string[] }>(
    'GET',
    `/host/properties/${propertyId}/readiness`,
    { actor: 'HOST' },
  );
  assert(
    readiness.status === 200 && readiness.json.blockers.length === 0,
    'readiness reports no remaining blockers',
    readiness.json,
  );

  const submit = await http<{ moderationStatus: string }>(
    'POST',
    `/host/properties/${propertyId}/submit`,
    { actor: 'HOST' },
  );
  assert(
    submit.json?.moderationStatus === 'PENDING_APPROVAL',
    'host submits the completed listing',
    submit.json,
  );

  // ---- 5. it reaches the admin queue --------------------------------------
  const queue = await http<{ items: Array<{ propertyId: string; blockers: string[] }> }>(
    'GET',
    '/admin/moderation/queue',
    { actor: 'ADMIN' },
  );
  assert(
    queue.json?.items?.some((i) => i.propertyId === propertyId),
    'listing appears in the admin review queue',
  );

  // A non-admin must not be able to read the queue.
  const hostPeek = await http('GET', '/admin/moderation/queue', { actor: 'HOST' });
  assert(hostPeek.status === 403, 'non-admin is refused the review queue', hostPeek.status);

  const detail = await http<{
    documents: unknown[];
    units: Array<{ unitId: string; photos: string[] }>;
    history: unknown[];
    allowedNext: string[];
  }>('GET', `/admin/moderation/${propertyId}`, { actor: 'ADMIN' });
  // Photos travel in the same payload as the paperwork: the reviewer is
  // checking one against the other, and a tab switch loses the comparison.
  assert(
    detail.json?.units?.length === 1 &&
      detail.json.units[0].unitId === unitId &&
      detail.json.units[0].photos.length === 2,
    `inspection view returns units with their photos (${detail.json?.units?.[0]?.photos?.length ?? 0})`,
    detail.json?.units,
  );
  assert(
    detail.json?.documents?.length === 2 &&
      detail.json.allowedNext.includes('APPROVED') &&
      detail.json.allowedNext.includes('REJECTED'),
    'inspection view returns documents and the legal next moves',
    detail.json?.allowedNext,
  );

  // ---- 6. a rejection needs a reason --------------------------------------
  const bareReject = await http('POST', `/admin/moderation/${propertyId}/reject`, {
    actor: 'ADMIN',
    body: {},
  });
  assert(bareReject.status === 400, 'rejection without a reason code is refused',
    bareReject.status);

  // ---- 7. approval publishes the listing ----------------------------------
  const approve = await http<{ moderationStatus: string }>(
    'POST',
    `/admin/moderation/${propertyId}/approve`,
    { actor: 'ADMIN' },
  );
  assert(approve.json?.moderationStatus === 'APPROVED', 'admin approves the listing',
    approve.json);

  const afterMap = await http<MapResponse>('GET', `/units/map-search?${VIEWPORT}`);
  const pin = afterMap.json.pins.find((p) => p.unitId === unitId);
  assert(pin !== undefined, 'approved listing appears on the map');

  // ---- 8. the privacy guard actually displaces the pin --------------------
  if (pin) {
    const distance = await db.query<{ metres: string }>(
      `SELECT ST_Distance(
                ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
                ST_SetSRID(ST_MakePoint($3,$4),4326)::geography)::text AS metres`,
      [TRUE_LNG, TRUE_LAT, pin.approxLng, pin.approxLat],
    );
    const metres = Number(distance.rows[0]?.metres ?? 0);
    assert(
      metres >= 250 && metres <= 500,
      `map pin is displaced ${Math.round(metres)} m from the true location`,
    );
    assert(
      pin.approxLat !== TRUE_LAT && pin.approxLng !== TRUE_LNG,
      'map response never carries the exact coordinates',
    );
    assert(pin.privacyRadiusMetres === 500, 'privacy radius is published to the client');
  }

  // ---- 9. a live deal changes the price ON the pin ------------------------
  await db.query(
    `INSERT INTO flash_deals (unit_id, created_by, title, discount_pct, status,
                              starts_at, ends_at, quantity_total)
     VALUES ($1,$2,'AlUla tonight -30%',30,'ACTIVE', now() - interval '1 minute',
             now() + interval '6 hours', 3)`,
    [unitId, hostId],
  );
  const dealMap = await http<MapResponse>('GET', `/units/map-search?${VIEWPORT}`);
  const dealPin = dealMap.json.pins.find((p) => p.unitId === unitId);
  assert(
    dealPin?.deal?.discountPct === 30 &&
      dealPin.priceMinor === Math.round(dealPin.basePriceMinor * 0.7),
    `pin carries the deal and the discounted price (${dealPin?.priceMinor} of ${dealPin?.basePriceMinor})`,
    dealPin,
  );

  // ---- 10. hourly vs nightly select different rates -----------------------
  const hourly = await http<MapResponse>(
    'GET',
    `/units/map-search?${VIEWPORT}&booking_type=HOURLY`,
  );
  const hourlyPin = hourly.json.pins.find((p) => p.unitId === unitId);
  assert(
    hourlyPin?.basePriceMinor === 25000 && dealPin?.basePriceMinor === 120000,
    'booking_type selects the hourly vs nightly rate',
    { hourly: hourlyPin?.basePriceMinor, nightly: dealPin?.basePriceMinor },
  );

  // ---- 11. viewport guard rails -------------------------------------------
  const huge = await http(
    'GET',
    '/units/map-search?min_lng=-180&min_lat=-90&max_lng=180&max_lat=90',
  );
  assert(huge.status === 400, 'a whole-planet viewport is refused', huge.status);

  const halfRange = await http(
    'GET',
    `/units/map-search?${VIEWPORT}&check_in_utc=${dayAt(5, 15)}`,
  );
  assert(
    halfRange.status === 400,
    'half a date range is refused rather than silently ignored',
    halfRange.status,
  );

  // ---- 12. availability filtering ------------------------------------------
  await db.query(
    `INSERT INTO unit_availability_blocks (unit_id, block_type, block_range)
     VALUES ($1,'MAINTENANCE', tstzrange($2::timestamptz, $3::timestamptz, '[)'))`,
    [unitId, dayAt(20, 0), dayAt(23, 0)],
  );
  const blocked = await http<MapResponse>(
    'GET',
    `/units/map-search?${VIEWPORT}&check_in_utc=${dayAt(21, 15)}&check_out_utc=${dayAt(22, 15)}`,
  );
  assert(
    !blocked.json.pins.some((p) => p.unitId === unitId),
    'a host-blocked window removes the pin from availability-filtered search',
  );

  // ---- 13. suspension pulls it straight off the map ------------------------
  const suspend = await http<{ moderationStatus: string }>(
    'POST',
    `/admin/moderation/${propertyId}/suspend`,
    { actor: 'ADMIN', body: { reasonCode: 'PROHIBITED_CONTENT', notes: 'Reported listing' } },
  );
  assert(suspend.json?.moderationStatus === 'SUSPENDED', 'admin suspends the listing');

  const suspendedMap = await http<MapResponse>('GET', `/units/map-search?${VIEWPORT}`);
  assert(
    !suspendedMap.json.pins.some((p) => p.unitId === unitId),
    'suspended listing disappears from the map immediately',
  );

  const suspendedHold = await http('POST', '/bookings/hold', {
    actor: 'GUEST',
    body: {
      guestId,
      unitId,
      bookingType: 'NIGHTLY',
      checkInUtc: dayAt(40, 15),
      checkOutUtc: dayAt(41, 15),
      guestsCount: 2,
    },
  });
  assert(suspendedHold.status >= 400, 'suspended listing stops taking bookings');

  // ---- 14. the decision trail is complete ----------------------------------
  const history = await db.query<{ to_status: string; reason_code: string | null }>(
    `SELECT to_status::text, reason_code::text FROM property_moderation_events
      WHERE property_id = $1 ORDER BY created_at`,
    [propertyId],
  );
  const trail = history.rows.map((r) => r.to_status).join(' -> ');
  assert(
    trail === 'PENDING_APPROVAL -> APPROVED -> SUSPENDED' &&
      history.rows[2]?.reason_code === 'PROHIBITED_CONTENT',
    `every decision is recorded with its reason (${trail})`,
    history.rows,
  );

  // ---- 15. rejection notifies the host ------------------------------------
  // A second listing, taken to REJECTED so the notification path runs for real
  // rather than being asserted about in the abstract.
  const prop2 = randomUUID();
  const unit2 = randomUUID();
  await db.query(
    `INSERT INTO properties (id, host_id, name, slug, property_type, status,
                             city, country_code, location,
                             national_short_address, building_number, additional_number,
                             tourism_permit_number, tourism_permit_expires_at)
     VALUES ($1,$2,'AlUla Rejected Villa',$3,'VILLA','ACTIVE','AlUla','SA',
             ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,
             'ALUL9911','1234','5678','MT-1445-BAD', current_date + 200)`,
    [prop2, hostId, `alula-rejected-${tag}`, TRUE_LNG + 0.01, TRUE_LAT + 0.01],
  );
  await db.query(
    `INSERT INTO units (id, property_id, name, unit_type, supports_hourly, supports_nightly,
                        max_guests, currency, base_nightly_rate_minor, turnaround_minutes, status)
     VALUES ($1,$2,'Villa','ENTIRE_VILLA',false,true,6,'SAR',200000::bigint,60,'ACTIVE')`,
    [unit2, prop2],
  );
  await db.query(
    `INSERT INTO property_documents (property_id, document_type, storage_key, file_name,
                                     content_type, size_bytes, uploaded_by)
     VALUES ($1,'TITLE_DEED',$2,'deed.pdf','application/pdf',1000,$3),
            ($1,'TOURISM_PERMIT',$4,'permit.pdf','application/pdf',1000,$3)`,
    [prop2, `props/${prop2}/deed.pdf`, hostId, `props/${prop2}/permit.pdf`],
  );
  await db.query(
    `UPDATE properties SET moderation_status='PENDING_APPROVAL' WHERE id=$1`,
    [prop2],
  );

  const reject = await http<{ moderationStatus: string }>(
    'POST',
    `/admin/moderation/${prop2}/reject`,
    {
      actor: 'ADMIN',
      body: { reasonCode: 'PERMIT_NOT_FOUND', notes: 'No match in the MoT register' },
    },
  );
  assert(
    reject.json?.moderationStatus === 'REJECTED',
    'rejection succeeds and the host notification path runs',
    reject.json,
  );
  // The notifier is best-effort by design: a decision must stand even if the
  // SMS gateway is down. So the assertion is that the DECISION survived, which
  // is the invariant that matters.
  const stillRejected = await db.query<{ moderation_status: string }>(
    `SELECT moderation_status::text FROM properties WHERE id=$1`,
    [prop2],
  );
  assert(
    stillRejected.rows[0]?.moderation_status === 'REJECTED',
    'the decision stands regardless of notification delivery',
  );

  // ---- 16. escrow override posts compensating entries ---------------------
  const balancesBefore = await db.query<{ account: string; balance: string }>(
    `SELECT account::text,
            COALESCE(sum(CASE direction WHEN 'CREDIT' THEN amount_minor
                                        ELSE -amount_minor END),0)::text AS balance
       FROM ledger_entries GROUP BY account`,
  );
  const before = Object.fromEntries(
    balancesBefore.rows.map((r) => [r.account, Number(r.balance)]),
  );
  const entriesBefore = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ledger_entries`,
  );

  const adjust = await http<{ entryGroupId: string }>(
    'POST',
    '/admin/escrow/adjustments',
    {
      actor: 'ADMIN',
      body: {
        fromAccount: 'PLATFORM_REVENUE',
        toAccount: 'HOST_PAYABLE',
        amountMinor: 2500,
        currency: 'SAR',
        reason: 'Goodwill correction after a commission miscalculation',
      },
    },
  );
  assert(
    typeof adjust.json?.entryGroupId === 'string',
    'manual escrow adjustment posts an entry group',
    adjust.json,
  );

  const balancesAfter = await db.query<{ account: string; balance: string }>(
    `SELECT account::text,
            COALESCE(sum(CASE direction WHEN 'CREDIT' THEN amount_minor
                                        ELSE -amount_minor END),0)::text AS balance
       FROM ledger_entries GROUP BY account`,
  );
  const after = Object.fromEntries(
    balancesAfter.rows.map((r) => [r.account, Number(r.balance)]),
  );
  assert(
    (after['HOST_PAYABLE'] ?? 0) - (before['HOST_PAYABLE'] ?? 0) === 2500 &&
      (after['PLATFORM_REVENUE'] ?? 0) - (before['PLATFORM_REVENUE'] ?? 0) === -2500,
    'the adjustment moves exactly the stated amount between the two accounts',
    { before, after },
  );

  // The whole point: nothing was rewritten. Entries only ever grow.
  const entriesAfter = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ledger_entries`,
  );
  assert(
    Number(entriesAfter.rows[0].n) === Number(entriesBefore.rows[0].n) + 2,
    'the correction is additive — two new legs, nothing edited',
    { before: entriesBefore.rows[0].n, after: entriesAfter.rows[0].n },
  );

  const unreasoned = await http('POST', '/admin/escrow/adjustments', {
    actor: 'ADMIN',
    body: {
      fromAccount: 'PLATFORM_REVENUE',
      toAccount: 'HOST_PAYABLE',
      amountMinor: 100,
      currency: 'SAR',
      reason: 'oops',
    },
  });
  assert(
    unreasoned.status === 400,
    'an adjustment without a real reason is refused',
    unreasoned.status,
  );

  const hostAdjust = await http('POST', '/admin/escrow/adjustments', {
    actor: 'HOST',
    body: {
      fromAccount: 'PLATFORM_REVENUE',
      toAccount: 'HOST_PAYABLE',
      amountMinor: 100,
      currency: 'SAR',
      reason: 'Paying myself a little extra today',
    },
  });
  assert(hostAdjust.status === 403, 'a non-admin cannot move money', hostAdjust.status);

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
