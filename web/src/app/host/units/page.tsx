import { Card, SectionTitle, StatusChip } from '@/components/ui';
import { getHostOverview, getUnitPhotos } from '@/lib/api';
import { money } from '@/lib/format';
import { PhotoManager } from './photo-manager';

export const dynamic = 'force-dynamic';

export default async function HostUnitsPage() {
  const host = await getHostOverview();
  if (!host) return <p className="text-zinc-500">No host profile found.</p>;

  // Photos are not part of the overview projection, so they are fetched
  // alongside it — one request per unit, in parallel.
  const photosByUnit = await Promise.all(
    host.units.map((u) => getUnitPhotos(u.id).catch(() => [] as string[])),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Units</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Photos are what guests judge a listing on — the first is the cover.
        </p>
      </header>

      {host.units.length === 0 ? (
        <Card className="px-6 py-16 text-center text-zinc-500">
          No units yet — list your first space.
        </Card>
      ) : (
        <div className="space-y-4">
          {host.units.map((u, i) => (
            <Card key={u.id} className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{u.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {u.propertyName}
                    {u.supportsHourly && u.hourlyRateMinor != null
                      ? ` · ${money(u.hourlyRateMinor, u.currency)}/hr`
                      : ''}
                    {u.supportsNightly && u.nightlyRateMinor != null
                      ? ` · ${money(u.nightlyRateMinor, u.currency)}/night`
                      : ''}
                  </p>
                </div>
                <StatusChip status={u.status} />
              </div>

              <SectionTitle>Photos</SectionTitle>
              <PhotoManager
                unitId={u.id}
                unitName={u.name}
                photos={photosByUnit[i]}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
