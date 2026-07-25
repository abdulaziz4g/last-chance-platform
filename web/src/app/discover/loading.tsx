import { Skeleton, SkeletonUnitGrid } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-2 h-2.5 w-20" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </header>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-5">
        <Skeleton className="col-span-2 h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      <SkeletonUnitGrid count={6} />
    </div>
  );
}
