import { Card } from '@/components/ui';
import { Skeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-2 h-2.5 w-24" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </header>

      <Skeleton className="h-7 w-64" />
      <Skeleton className="mt-2 h-3 w-48" />

      <div className="mt-8 mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div>
            <Skeleton className="mb-3 h-3 w-36" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-24" />
            <Card className="p-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i}>
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="mt-2 h-3.5 w-20" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-28" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-20 rounded-lg" />
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card className="p-5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-2 h-2.5 w-20" />
            <div className="my-4 border-t border-zinc-100 dark:border-white/[0.06]" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-3/4" />
            <Skeleton className="mt-4 h-11 w-full rounded-lg" />
          </Card>
        </div>
      </div>
    </div>
  );
}
