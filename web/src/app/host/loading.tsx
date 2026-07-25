import { Skeleton, SkeletonStatRow, SkeletonTable } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="space-y-10">
      <header>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-3 w-40" />
      </header>

      <section>
        <SkeletonStatRow
          count={3}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        />
      </section>

      <section>
        <Skeleton className="mb-3 h-3 w-28" />
        <SkeletonTable rows={4} cols={5} />
      </section>

      <section>
        <Skeleton className="mb-3 h-3 w-36" />
        <SkeletonTable rows={6} cols={7} />
      </section>
    </div>
  );
}
