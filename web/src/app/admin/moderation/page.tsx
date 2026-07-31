import Link from 'next/link';
import { DataTable, SectionTitle, StatusChip } from '@/components/ui';
import { getModerationQueue } from '@/lib/api';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TABS: Array<{ key: string; label: string }> = [
  { key: 'PENDING_APPROVAL', label: 'Awaiting review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'DRAFT', label: 'Drafts' },
  { key: 'ALL', label: 'All' },
];

const DONE_MESSAGE: Record<string, string> = {
  approved: 'Listing approved — it is live on the map now.',
  rejected: 'Listing rejected. The host has been told why.',
  suspended: 'Listing suspended and pulled from the map.',
  reinstated: 'Listing reinstated.',
};

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? 'PENDING_APPROVAL';
  const { items } = await getModerationQueue(status);
  const done = sp.done ? DONE_MESSAGE[sp.done] : undefined;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Listing review</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Nothing reaches the public map until it clears this queue. Check the
          title deed against the National Address, and the permit against the
          Ministry of Tourism register.
        </p>
      </header>

      {done ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {done}
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {TABS.map((tab) => {
          const active = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={`/admin/moderation?status=${tab.key}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <section>
        <SectionTitle>
          {items.length} listing{items.length === 1 ? '' : 's'}
        </SectionTitle>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Nothing here. {status === 'PENDING_APPROVAL' ? 'The queue is clear.' : null}
          </p>
        ) : (
          <DataTable
            head={[
              'Listing',
              'Host',
              'Location',
              'Permit',
              'Units',
              'Docs',
              'Readiness',
              'Submitted',
              '',
            ]}
            rows={items.map((item) => [
              <div key="n">
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-zinc-500">{item.propertyType}</div>
              </div>,
              <div key="h">
                <div>{item.hostDisplayName}</div>
                <div className="text-xs text-zinc-500">
                  KYC {item.hostKycStatus.toLowerCase().replace('_', ' ')}
                </div>
              </div>,
              <div key="l">
                <div>
                  {item.city}
                  {item.district ? `, ${item.district}` : ''}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  {item.nationalShortAddress ?? '— no National Address —'}
                </div>
              </div>,
              <span key="p" className="font-mono text-xs">
                {item.tourismPermitNumber ?? '—'}
              </span>,
              <span key="u" className="tnum">
                {item.unitCount}
              </span>,
              <span key="d" className="tnum">
                {item.documentCount}
              </span>,
              // The blocker count is the reviewer's triage signal: a listing
              // with gaps cannot be approved, so it is not worth opening yet.
              item.blockers.length === 0 ? (
                <StatusChip key="r" status="READY" />
              ) : (
                <span
                  key="r"
                  title={item.blockers.join(', ')}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                >
                  {item.blockers.length} gap
                  {item.blockers.length === 1 ? '' : 's'}
                </span>
              ),
              <span key="s" className="text-xs text-zinc-500">
                {dateTime(item.submittedAt)}
              </span>,
              <Link
                key="a"
                href={`/admin/moderation/${item.propertyId}`}
                className="text-sm font-medium underline underline-offset-4"
              >
                Inspect
              </Link>,
            ])}
          />
        )}
      </section>
    </div>
  );
}
