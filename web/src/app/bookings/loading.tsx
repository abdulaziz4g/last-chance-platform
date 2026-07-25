import { Skeleton, SkeletonBookingList } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-2 h-2.5 w-24" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </header>

      <Skeleton className="mb-3 h-3 w-24" />
      <SkeletonBookingList count={3} />
    </div>
  );
}
