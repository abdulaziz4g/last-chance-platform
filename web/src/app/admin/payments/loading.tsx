import { Skeleton, SkeletonTable } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="space-y-10">
      <header>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-3 w-64" />
      </header>

      <section>
        <Skeleton className="mb-3 h-3 w-32" />
        <SkeletonTable rows={6} cols={7} />
      </section>

      <section>
        <Skeleton className="mb-3 h-3 w-28" />
        <SkeletonTable rows={5} cols={6} />
      </section>

      <section>
        <Skeleton className="mb-3 h-3 w-36" />
        <SkeletonTable rows={5} cols={6} />
      </section>
    </div>
  );
}
