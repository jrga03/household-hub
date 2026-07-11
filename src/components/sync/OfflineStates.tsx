/**
 * Shared offline UI states for routes serving Dexie data (review R11)
 *
 * - OfflineHint: inline notice shown ABOVE content when a page is rendering
 *   data from the local device mirror while the network is unreachable.
 * - OfflineEmptyState: honest empty state for when the device has no local
 *   copy of the requested data (e.g. a month of budgets never fetched here),
 *   replacing false "no data" empty states and blank screens.
 */

import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OfflineHint({ className }: { className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm text-muted-foreground",
        className
      )}
    >
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>You&apos;re offline. Showing data saved on this device.</span>
    </p>
  );
}

interface OfflineEmptyStateProps {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}

export function OfflineEmptyState({
  title = "You're offline",
  description,
  onRetry,
  className,
}: OfflineEmptyStateProps) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}
    >
      <CloudOff className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
