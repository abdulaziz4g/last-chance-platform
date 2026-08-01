import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionTitle, StatusChip } from '@/components/ui';
import { getModerationDetail, moderationDocumentHref } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { DecisionPanel } from './decision-panel';

export const dynamic = 'force-dynamic';

const DOC_LABELS: Record<string, string> = {
  TITLE_DEED: 'Title deed',
  LEASE_CONTRACT: 'Lease contract',
  TOURISM_PERMIT: 'Ministry of Tourism permit',
  NATIONAL_ADDRESS_CERT: 'National Address certificate',
  OTHER: 'Other document',
};

const BLOCKER_LABELS: Record<string, string> = {
  NATIONAL_ADDRESS_MISSING: 'No National Address',
  PERMIT_NUMBER_MISSING: 'No tourism permit number',
  PERMIT_EXPIRY_MISSING: 'No permit expiry date',
  PERMIT_EXPIRED: 'Tourism permit has expired',
  DEED_OR_LEASE_MISSING: 'No title deed or lease contract uploaded',
  PERMIT_DOCUMENT_MISSING: 'No permit document uploaded',
  HOST_KYC_INCOMPLETE: 'Host identity is not verified',
  NO_UNITS: 'Listing has no units',
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-taupe-500">{label}</dt>
      <dd className={value ? 'mt-0.5 text-sm' : 'mt-0.5 text-sm text-zinc-400'}>
        {value ?? '— not provided —'}
      </dd>
    </div>
  );
}

export default async function ModerationDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  let detail;
  try {
    detail = await getModerationDetail(propertyId);
  } catch {
    notFound();
  }

  const { property, documents, units, history, allowedNext } = detail;
  const photoCount = units.reduce((n, u) => n + u.photos.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/moderation"
          className="text-sm text-taupe-500 underline underline-offset-4"
        >
          ← Back to the queue
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{property.name}</h1>
          <p className="mt-1 text-sm text-taupe-500 dark:text-zinc-400">
            {property.propertyType} · {property.city}
            {property.district ? `, ${property.district}` : ''} ·{' '}
            {property.unitCount} unit{property.unitCount === 1 ? '' : 's'} ·
            hosted by {property.hostDisplayName}
          </p>
        </div>
        <StatusChip status={property.moderationStatus} />
      </header>

      {property.blockers.length > 0 ? (
        <section className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Outstanding compliance gaps
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-200">
            {property.blockers.map((b) => (
              <li key={b}>{BLOCKER_LABELS[b] ?? b}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Side-by-side: the reviewer is comparing the paperwork against the
          address, so the two must be readable at the same time rather than
          across a tab switch. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section>
            <SectionTitle>National Address & permit</SectionTitle>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field
                label="Short address"
                value={property.nationalShortAddress}
              />
              <Field label="Building no." value={property.buildingNumber} />
              <Field label="Additional no." value={property.additionalNumber} />
              <Field label="District" value={property.district} />
              <Field
                label="Permit number"
                value={property.tourismPermitNumber}
              />
              <Field
                label="Permit expires"
                value={property.tourismPermitExpiresAt}
              />
              <Field label="Host KYC" value={property.hostKycStatus} />
              <Field label="Country" value={property.countryCode} />
            </dl>
          </section>

          {/* Photos sit directly above the paperwork on purpose: the reviewer
              is checking that the pictures depict the property the deed
              describes, and a villa's deed against photos of an apartment
              block is the cheapest fraud to catch and the easiest to miss if
              the two are a tab apart. */}
          <section>
            <SectionTitle>
              Listing photos ({photoCount} across {units.length} unit
              {units.length === 1 ? '' : 's'})
            </SectionTitle>
            {units.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-taupe-500 dark:border-zinc-700">
                This listing has no units.
              </p>
            ) : (
              <ul className="space-y-5">
                {units.map((unit) => (
                  <li key={unit.unitId}>
                    <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                      <span className="font-medium">{unit.name}</span>
                      <span className="text-xs text-taupe-500">
                        {unit.unitType} · sleeps {unit.maxGuests} · {unit.status}
                      </span>
                    </div>
                    {unit.photos.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        No photos uploaded for this unit.
                      </p>
                    ) : (
                      <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                        {unit.photos.map((src) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={src}
                            src={src}
                            alt={`${unit.name} listing photo`}
                            loading="lazy"
                            className="h-40 w-auto shrink-0 rounded border border-zinc-200 object-cover dark:border-zinc-700"
                          />
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle>Documents ({documents.length})</SectionTitle>
            {documents.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-taupe-500 dark:border-zinc-700">
                No documents uploaded.
              </p>
            ) : (
              <ul className="space-y-6">
                {documents.map((doc) => {
                  const href = moderationDocumentHref(propertyId, doc.id);
                  const expired =
                    doc.expiresOn !== null &&
                    new Date(doc.expiresOn) < new Date();
                  return (
                    <li
                      key={doc.id}
                      className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold">
                          {DOC_LABELS[doc.documentType] ?? doc.documentType}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-taupe-500">
                          {expired ? (
                            <span className="font-medium text-red-600 dark:text-red-400">
                              Expired {doc.expiresOn}
                            </span>
                          ) : doc.expiresOn ? (
                            <span>Valid to {doc.expiresOn}</span>
                          ) : null}
                          <span>{Math.round(doc.sizeBytes / 1024)} KB</span>
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4"
                          >
                            Open full size
                          </a>
                        </div>
                      </div>

                      {/* Rendered inline so the reviewer reads the deed and the
                          address on one screen. */}
                      {doc.contentType === 'application/pdf' ? (
                        <iframe
                          src={href}
                          title={`${DOC_LABELS[doc.documentType] ?? doc.documentType} — ${doc.fileName}`}
                          className="mt-3 h-[28rem] w-full rounded border border-zinc-200 bg-white dark:border-zinc-700"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={href}
                          alt={`${DOC_LABELS[doc.documentType] ?? doc.documentType} — ${doc.fileName}`}
                          className="mt-3 max-h-[28rem] w-auto rounded border border-zinc-200 dark:border-zinc-700"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle>Decision history</SectionTitle>
            {history.length === 0 ? (
              <p className="text-sm text-taupe-500">
                No decisions recorded yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {history.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-zinc-200 pl-3 text-sm dark:border-zinc-700"
                  >
                    <span className="font-medium">
                      {event.fromStatus ?? '—'} → {event.toStatus}
                    </span>
                    <span className="text-xs text-taupe-500">
                      {event.actorType} · {dateTime(event.createdAt)}
                    </span>
                    {event.reasonCode ? (
                      <span className="w-full text-xs text-zinc-600 dark:text-zinc-300">
                        {event.reasonCode.toLowerCase().replace(/_/g, ' ')}
                        {event.notes ? ` — ${event.notes}` : ''}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Decision</h2>
            <p className="mt-1 text-xs text-taupe-500">
              Recorded permanently against this listing.
            </p>
            <div className="mt-4">
              <DecisionPanel
                propertyId={propertyId}
                status={property.moderationStatus}
                allowedNext={allowedNext}
                blockers={property.blockers}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
