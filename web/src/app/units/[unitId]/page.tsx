import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUnitDetail, type UnitDetail } from '@/lib/api';
import { money } from '@/lib/format';
import { Card, SectionTitle, StatusChip } from '@/components/ui';
import { GuestHeader } from '@/components/guest-header';
import { SITE_URL } from '@/lib/site';
import { LiveDeal } from './live-deal';
import { PhotoGallery } from './photo-gallery';

export const dynamic = 'force-dynamic';

/** Fetched twice per request (metadata + page); React dedupes within a render. */
async function loadDetail(unitId: string): Promise<UnitDetail | null> {
  try {
    return await getUnitDetail(unitId);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ unitId: string }>;
}): Promise<Metadata> {
  const { unitId } = await params;
  const detail = await loadDetail(unitId);
  if (!detail) return { title: 'Stay not found' };

  const { unit, property } = detail;
  const rate = unit.hourlyRateMinor ?? unit.nightlyRateMinor;
  const per = unit.hourlyRateMinor != null ? 'hour' : 'night';

  const title = `${property.name} — ${unit.name}`;
  const description = property.description
    ? property.description.slice(0, 155)
    : `${unit.name} in ${property.city}. Sleeps ${unit.maxGuests}${
        rate != null ? `, from ${money(rate, unit.currency)} per ${per}` : ''
      }.`;

  return {
    title,
    description,
    alternates: { canonical: `/units/${unitId}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/units/${unitId}`,
      images: unit.photos.length > 0 ? [{ url: unit.photos[0] }] : undefined,
    },
  };
}

/**
 * schema.org LodgingBusiness — what gets a listing a rich result rather than a
 * plain blue link. Only fields we actually hold are emitted: inventing a
 * rating or a price would be structured-data spam, and search engines
 * penalise markup that disagrees with the visible page.
 */
function buildListingJsonLd(
  detail: UnitDetail,
  unitId: string,
): Record<string, unknown> {
  const { unit, property, host } = detail;
  const rate = unit.hourlyRateMinor ?? unit.nightlyRateMinor;

  // Structured data has no document base to resolve against — unlike the
  // metadata API, which applies metadataBase for us. A relative @id or photo
  // here is simply unusable to a crawler, so both are made absolute.
  const absolute = (path: string) =>
    path.startsWith('http') ? path : `${SITE_URL}${path}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    '@id': absolute(`/units/${unitId}`),
    name: `${property.name} — ${unit.name}`,
    ...(property.description ? { description: property.description } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: property.city,
      addressCountry: property.countryCode,
    },
    // Approximate by construction — the API no longer returns the true point.
    // Worth stating because this block is structured data: a crawler stores
    // whatever is published here, so an "accuracy improvement" that reached
    // for an exact coordinate would hand every listing's real position to
    // search engines permanently.
    geo: {
      '@type': 'GeoCoordinates',
      latitude: property.lat,
      longitude: property.lon,
    },
    ...(unit.photos.length > 0
      ? { photo: unit.photos.map(absolute), image: absolute(unit.photos[0]) }
      : {}),
    ...(property.amenities.length > 0
      ? {
          amenityFeature: property.amenities.map((a) => ({
            '@type': 'LocationFeatureSpecification',
            name: a,
          })),
        }
      : {}),
    ...(property.ratingAvg != null && property.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: property.ratingAvg,
            reviewCount: property.ratingCount,
          },
        }
      : {}),
    ...(rate != null
      ? {
          priceRange: money(rate, unit.currency),
          makesOffer: {
            '@type': 'Offer',
            price: (rate / 100).toFixed(2),
            priceCurrency: unit.currency,
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
    ...(unit.bedrooms != null ? { numberOfRooms: unit.bedrooms } : {}),
    ...(host.displayName
      ? { provider: { '@type': 'Organization', name: host.displayName } }
      : {}),
  };
}

/** jsonb `policies` has no fixed shape; render only the primitive entries. */
function readablePolicies(
  policies: Record<string, unknown>,
): { label: string; value: string }[] {
  return Object.entries(policies)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => ({
      label: k.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'),
      value: typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v),
    }));
}

/** "2h 30m" from minutes — durations read better than raw counts. */
function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;

  let detail;
  try {
    detail = await getUnitDetail(unitId);
  } catch (e) {
    // A missing or delisted unit is a 404, not a crash — anything else is a
    // real fault and belongs to the error boundary.
    if (e instanceof Error && e.message.endsWith('responded 404')) notFound();
    throw e;
  }

  const { unit, property, host, reviews, activeDeal } = detail;
  const jsonLd = buildListingJsonLd(detail, unitId);
  const policies = readablePolicies(property.policies);

  const hourly = unit.supportsHourly ? unit.hourlyRateMinor : null;
  const nightly = unit.supportsNightly ? unit.nightlyRateMinor : null;

  const discounted = (minor: number | null) =>
    minor != null && activeDeal
      ? Math.round(minor * (1 - activeDeal.discountPct / 100))
      : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      {/* Values come from our own database, not from user input that could
          close the script tag — but stringify escaping is cheap insurance. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <GuestHeader area="Stay details">
        <Link
          href="/discover"
          className="text-sm whitespace-nowrap text-zinc-500 transition-colors hover:text-brass-500 dark:text-zinc-400 dark:hover:text-brass-400"
        >
          ← Back to search
        </Link>
      </GuestHeader>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{property.name}</h1>
          {unit.instantBook ? <StatusChip status="ACTIVE" /> : null}
          {host.isSuperhost ? (
            <span className="rounded-full bg-brass-400/15 px-2.5 py-0.5 text-[11px] font-medium text-brass-600 ring-1 ring-inset ring-brass-400/30 dark:text-brass-300">
              Superhost
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          {unit.name} · {property.city}, {property.countryCode}
          {property.ratingAvg
            ? ` · ★ ${property.ratingAvg} (${property.ratingCount})`
            : ''}
        </p>
      </div>

      <PhotoGallery
        photos={unit.photos}
        alt={`${property.name} — ${unit.name}`}
      />

      {activeDeal && (
        <Card className="mb-8 border-brass-400/30 bg-gradient-to-b from-brass-400/[0.08] to-transparent p-5 dark:border-brass-500/25">
          <LiveDeal
            unitId={unit.id}
            dealId={activeDeal.id}
            title={activeDeal.title}
            discountPct={activeDeal.discountPct}
            endsAt={activeDeal.endsAt}
            quantityRemaining={activeDeal.quantityRemaining}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {property.description && (
            <section>
              <SectionTitle>About this space</SectionTitle>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {property.description}
              </p>
            </section>
          )}

          <section>
            <SectionTitle>The unit</SectionTitle>
            <Card className="p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                <Spec label="Type" value={unit.unitType.replaceAll('_', ' ')} />
                <Spec label="Sleeps" value={`${unit.maxGuests} guests`} />
                {unit.bedrooms != null && (
                  <Spec label="Bedrooms" value={String(unit.bedrooms)} />
                )}
                {unit.beds != null && <Spec label="Beds" value={String(unit.beds)} />}
                {unit.bathrooms != null && (
                  <Spec label="Bathrooms" value={String(unit.bathrooms)} />
                )}
                {unit.areaSqm != null && (
                  <Spec label="Area" value={`${unit.areaSqm} m²`} />
                )}
                {unit.supportsHourly && (
                  <Spec
                    label="Minimum stay"
                    value={duration(unit.minHourlyDurationMinutes)}
                  />
                )}
                <Spec
                  label="Booking"
                  value={unit.instantBook ? 'Instant' : 'On request'}
                />
              </dl>
            </Card>
          </section>

          {property.amenities.length > 0 && (
            <section>
              <SectionTitle>Amenities</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {property.amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>House rules</SectionTitle>
            <Card className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              <div className="flex justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Check-in</span>
                <span>from {property.defaultCheckInTime.slice(0, 5)}</span>
              </div>
              <div className="flex justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Check-out</span>
                <span>by {property.defaultCheckOutTime.slice(0, 5)}</span>
              </div>
              <div className="flex justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Turnaround
                </span>
                <span>{duration(unit.turnaroundMinutes)} after checkout</span>
              </div>
              {policies.map((p) => (
                <div
                  key={p.label}
                  className="flex justify-between gap-3 px-5 py-3 text-sm"
                >
                  <span className="text-zinc-500 capitalize dark:text-zinc-400">
                    {p.label}
                  </span>
                  <span className="text-right">{p.value}</span>
                </div>
              ))}
              <p className="px-5 py-3 text-[11px] text-zinc-400 dark:text-zinc-600">
                Times shown in {property.timezone}.
              </p>
            </Card>
          </section>

          <section>
            <SectionTitle>Your host</SectionTitle>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-400/15 text-sm font-semibold text-brass-600 dark:text-brass-300"
                >
                  {host.displayName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold">{host.displayName}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {host.ratingAvg
                      ? `★ ${host.ratingAvg} · ${host.ratingCount} reviews`
                      : 'No reviews yet'}
                    {host.isSuperhost ? ' · Superhost' : ''}
                  </p>
                </div>
              </div>
              {host.bio && (
                <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {host.bio}
                </p>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle>
              {reviews.length > 0
                ? `Reviews (${property.ratingCount})`
                : 'Reviews'}
            </SectionTitle>
            {reviews.length === 0 ? (
              <Card className="px-5 py-10 text-center text-sm text-zinc-500">
                No reviews yet — be the first to stay here.
              </Card>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <Card key={r.id} className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{r.authorName}</p>
                      <p className="tnum text-xs text-brass-500 dark:text-brass-300">
                        {'★'.repeat(r.overallRating)}
                        <span className="text-zinc-300 dark:text-zinc-700">
                          {'★'.repeat(5 - r.overallRating)}
                        </span>
                      </p>
                    </div>
                    {r.comment && (
                      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                        {r.comment}
                      </p>
                    )}
                    {r.hostReply && (
                      <div className="mt-3 border-l-2 border-brass-400/40 pl-3">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                          {host.displayName} replied
                        </p>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                          {r.hostReply}
                        </p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Booking rail — sticky beside the content on desktop. */}
        <div className="lg:col-span-1">
          <Card className="p-5 lg:sticky lg:top-8">
            <div className="space-y-3">
              {hourly != null && (
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="tnum text-xl font-semibold text-brass-500 dark:text-brass-300">
                      {money(discounted(hourly) ?? hourly, unit.currency)}
                    </p>
                    <p className="text-[11px] text-zinc-500">per hour</p>
                  </div>
                  {discounted(hourly) != null && (
                    <p className="tnum text-xs text-zinc-400 line-through">
                      {money(hourly, unit.currency)}
                    </p>
                  )}
                </div>
              )}
              {nightly != null && (
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="tnum text-xl font-semibold text-brass-500 dark:text-brass-300">
                      {money(discounted(nightly) ?? nightly, unit.currency)}
                    </p>
                    <p className="text-[11px] text-zinc-500">per night</p>
                  </div>
                  {discounted(nightly) != null && (
                    <p className="tnum text-xs text-zinc-400 line-through">
                      {money(nightly, unit.currency)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="my-4 border-t border-zinc-100 dark:border-white/[0.06]" />

            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Up to {unit.maxGuests} guests.{' '}
              {unit.instantBook
                ? 'Confirms immediately once paid.'
                : 'The host reviews each request.'}
            </p>

            <Link
              href={`/book/${unit.id}`}
              className="mt-4 block rounded-lg bg-brass-500 px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-brass-600 dark:bg-brass-600 dark:hover:bg-brass-500"
            >
              Book this stay
            </Link>

            <p className="mt-3 text-center text-[11px] text-zinc-400">
              A 10-minute hold reserves it while you pay.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
