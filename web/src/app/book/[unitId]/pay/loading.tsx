import { Card } from '@/components/ui';
import { Skeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <header className="mb-8">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="mt-2 h-2.5 w-32" />
      </header>

      <Card className="mb-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="my-3 border-t border-zinc-100 dark:border-white/[0.06]" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-full" />
          <div className="my-3 border-t border-zinc-100 dark:border-white/[0.06]" />
          <Skeleton className="h-5 w-full" />
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </Card>

      <Skeleton className="mt-4 h-11 w-full rounded-lg" />
    </main>
  );
}
