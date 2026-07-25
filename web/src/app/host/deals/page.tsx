import { getActiveDeals, getHostOverview } from '@/lib/api';
import { money, dateTime } from '@/lib/format';
import { Card, DataTable, SectionTitle, StatusChip, Mono } from '@/components/ui';
import { DealForm } from './deal-form';

export const dynamic = 'force-dynamic';

export default async function HostDealsPage() {
  const [deals, host] = await Promise.all([
    getActiveDeals().catch(() => []),
    getHostOverview(),
  ]);

  const units = host?.units ?? [];

  return (
    <div className="space-y-8">
      <SectionTitle>Create flash deal</SectionTitle>
      {units.length === 0 ? (
        <Card className="px-6 py-10 text-center text-zinc-500">
          No units found. Add a unit to create flash deals.
        </Card>
      ) : (
        <DealForm units={units} />
      )}

      <SectionTitle>Active deals</SectionTitle>
      <DataTable
        head={['Title', 'Property / Unit', 'Discount', 'Remaining', 'Ends', 'Status']}
        rows={deals.map((d) => [
          d.title,
          <span key="u" className="text-xs text-zinc-500 dark:text-zinc-400">
            {d.propertyName} / {d.unitName}
          </span>,
          <span key="d" className="tnum font-semibold text-emerald-600 dark:text-emerald-400">
            {d.discountPct}% off
          </span>,
          <Mono key="r">
            {d.quantityRemaining} / {d.quantityTotal}
          </Mono>,
          dateTime(d.endsAt),
          <StatusChip key="s" status={d.status} />,
        ])}
        empty="No active flash deals"
      />
    </div>
  );
}
