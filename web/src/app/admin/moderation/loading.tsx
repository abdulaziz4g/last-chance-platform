import { Skeleton, SkeletonTable } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="space-y-8">
      <header>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-3 w-96" />
      </header>

      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>

      <section>
        <Skeleton className="mb-3 h-3 w-28" />
        <SkeletonTable rows={8} cols={9} />
      </section>
    </div>
  );
}
