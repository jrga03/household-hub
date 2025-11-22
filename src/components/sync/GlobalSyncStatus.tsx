import { useState } from "react";
import { Cloud, CloudOff, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { SyncQueueViewer } from "@/components/sync/SyncQueueViewer";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface GlobalSyncStatusProps {
  /**
   * Variant for different display contexts
   * @default "default"
   */
  variant?: "default" | "compact" | "detailed";
  /**
   * Optional className for additional styling
   */
  className?: string;
}

/**
 * GlobalSyncStatus Component
 *
 * Displays the overall sync status in the app header, showing:
 * - Online/offline status
 * - Number of items pending sync
 * - Active sync operation status
 * - Last successful sync time
 *
 * @example
 * // In header
 * <GlobalSyncStatus />
 *
 * @example
 * // Compact variant for mobile
 * <GlobalSyncStatus variant="compact" />
 *
 * @example
 * // Detailed variant for settings
 * <GlobalSyncStatus variant="detailed" />
 */
export function GlobalSyncStatus({ variant = "default", className }: GlobalSyncStatusProps) {
  const { isOnline, pendingCount, isSyncing, lastSyncTime } = useSyncStatus();
  const [showQueue, setShowQueue] = useState(false);

  // Determine status state
  const hasFailures = false; // TODO: Track failed syncs separately
  const hasPending = pendingCount > 0;

  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        icon: CloudOff,
        label: "Offline",
        sublabel: hasPending ? `${pendingCount} pending` : "All changes saved locally",
        className: "text-muted-foreground",
        animate: false,
      };
    }

    if (isSyncing) {
      return {
        icon: Loader2,
        label: "Syncing",
        sublabel: `${pendingCount} ${pendingCount === 1 ? "item" : "items"}`,
        className: "text-blue-600 dark:text-blue-500",
        animate: true,
      };
    }

    if (hasFailures) {
      return {
        icon: AlertCircle,
        label: "Sync failed",
        sublabel: "Tap to retry",
        className: "text-red-600 dark:text-red-500",
        animate: false,
      };
    }

    if (hasPending) {
      return {
        icon: Cloud,
        label: "Pending sync",
        sublabel: `${pendingCount} ${pendingCount === 1 ? "item" : "items"}`,
        className: "text-amber-600 dark:text-amber-500",
        animate: false,
      };
    }

    return {
      icon: Cloud,
      label: "All synced",
      sublabel: lastSyncTime
        ? `Updated ${formatDistanceToNow(lastSyncTime, { addSuffix: true })}`
        : "Up to date",
      className: "text-green-600 dark:text-green-500",
      animate: false,
    };
  };

  const status = getStatusConfig();
  const Icon = status.icon;

  if (variant === "compact") {
    return (
      <>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  className
                )}
                onClick={() => setShowQueue(true)}
                aria-label={`${status.label}: ${status.sublabel}`}
              >
                <Icon
                  className={cn("h-4 w-4", status.className, status.animate && "animate-spin")}
                  aria-hidden="true"
                />
                {hasPending && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {pendingCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium">{status.label}</p>
                <p className="text-xs text-muted-foreground">{status.sublabel}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <SyncQueueViewer open={showQueue} onOpenChange={setShowQueue} />
      </>
    );
  }

  if (variant === "detailed") {
    return (
      <>
        <button
          onClick={() => setShowQueue(true)}
          className={cn(
            "flex items-center gap-3 rounded-lg border bg-card p-4 w-full text-left transition-colors hover:bg-accent",
            className
          )}
        >
          <div className="flex-shrink-0">
            <Icon
              className={cn("h-6 w-6", status.className, status.animate && "animate-spin")}
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{status.label}</p>
            <p className="text-xs text-muted-foreground">{status.sublabel}</p>
          </div>
          {hasPending && (
            <div className="flex-shrink-0">
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {pendingCount} pending
              </span>
            </div>
          )}
        </button>
        <SyncQueueViewer open={showQueue} onOpenChange={setShowQueue} />
      </>
    );
  }

  // Default variant
  return (
    <>
      <button
        onClick={() => setShowQueue(true)}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent",
          className
        )}
        aria-label={`${status.label}: ${status.sublabel}`}
      >
        <Icon
          className={cn("h-4 w-4", status.className, status.animate && "animate-spin")}
          aria-hidden="true"
        />
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", status.className)}>{status.label}</span>
          {hasPending && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {pendingCount}
            </span>
          )}
        </div>
      </button>
      <SyncQueueViewer open={showQueue} onOpenChange={setShowQueue} />
    </>
  );
}
