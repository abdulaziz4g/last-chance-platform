import { Skeleton, SkeletonTable } from '@/components/skeleton';
import { REPORT_PAGE_SIZE } from '@/lib/api';

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mb-3 h-3 w-64" />
      <SkeletonTable rows={REPORT_PAGE_SIZE} cols={8} />
    </div>
  );
}
