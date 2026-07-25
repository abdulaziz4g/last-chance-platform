import { Card } from '@/components/ui';
import { Skeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-col items-center">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="mt-4 h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="my-3 border-t border-zinc-100 dark:border-white/[0.06]" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Card>

      <div className="mt-8 flex justify-center gap-4">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </main>
  );
}
