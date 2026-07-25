import { Card } from '@/components/ui';
import { Skeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <header>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-2 h-3 w-80" />
      </header>

      <div className="space-y-4">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i} className="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="mt-2 h-2.5 w-52" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="mb-3 h-3 w-20" />
            <div className="flex gap-2">
              <Skeleton className="h-20 w-28 rounded-lg" />
              <Skeleton className="h-20 w-28 rounded-lg" />
            </div>
            <Skeleton className="mt-3 h-8 w-64 rounded-md" />
          </Card>
        ))}
      </div>
    </div>
  );
}
