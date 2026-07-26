import { Skeleton, SkeletonStatRow, SkeletonTable } from '@/components/skeleton';
import { REPORT_PAGE_SIZE } from '@/lib/api';

export default function Loading() {
  return (
    <div className="space-y-10">
      <header>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-2 h-3 w-80" />
      </header>

      <section>
        <Skeleton className="mb-3 h-3 w-36" />
        <SkeletonStatRow count={6} />
      </section>

      <section>
        <Skeleton className="mb-3 h-3 w-32" />
        <SkeletonTable rows={REPORT_PAGE_SIZE} cols={6} />
      </section>
    </div>
  );
}
