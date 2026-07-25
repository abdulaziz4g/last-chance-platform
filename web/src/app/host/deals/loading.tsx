import { Card } from '@/components/ui';
import { Skeleton, SkeletonTable } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="space-y-8">
      <Skeleton className="mb-3 h-3 w-40" />

      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </Card>

      <Skeleton className="mb-3 h-3 w-32" />
      <SkeletonTable rows={5} cols={6} />
    </div>
  );
}
