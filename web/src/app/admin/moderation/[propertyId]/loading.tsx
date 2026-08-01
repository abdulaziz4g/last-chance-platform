import { Skeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-3 w-32" />
      <header>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-2 h-3 w-80" />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section>
            <Skeleton className="mb-3 h-3 w-44" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="mt-1.5 h-3.5 w-28" />
                </div>
              ))}
            </div>
          </section>

          <section>
            <Skeleton className="mb-3 h-3 w-32" />
            <div className="space-y-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[30rem] w-full rounded-lg" />
              ))}
            </div>
          </section>
        </div>

        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
