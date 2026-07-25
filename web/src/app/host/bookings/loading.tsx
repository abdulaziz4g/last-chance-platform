import { Skeleton, SkeletonTable } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mb-3 h-3 w-64" />
      <SkeletonTable rows={8} cols={8} />
    </div>
  );
}
