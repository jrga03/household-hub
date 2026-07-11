import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Structural loading fallback for lazy-loaded chart cards (mobile UX review,
 * low item "Dashboard chart skeleton mismatch"): mirrors the populated chart
 * cards' real shape — Card padding, title line, ~280px plot area — instead of
 * a magic-height block, so the layout doesn't shift when the chart mounts.
 */
export function ChartCardSkeleton() {
  return (
    <Card className="p-4 sm:p-6">
      <Skeleton className="mb-4 h-7 w-40" />
      <Skeleton className="h-[280px] w-full" />
    </Card>
  );
}
