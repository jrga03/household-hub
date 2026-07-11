import { useState } from "react";
import { Cloud, CloudOff, Loader2, AlertCircle, RefreshCw, type LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";
import { SyncQueueViewer } from "@/components/sync/SyncQueueViewer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

export interface SyncStatusConfig {
  icon: LucideIcon;
  label: string;
  sublabel: string;
  className: string;
  animate: boolean;
}

export interface SyncStatusInputs {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncTime: Date | null;
}

/**
 * Pure status resolution for the global sync indicator.
 *
 * Precedence: offline → syncing → failed → pending → synced. Failures must
 * win over the green "All synced" state so terminal sync errors are never
 * masked by an otherwise-empty queue (review R3).
 */
export function getSyncStatusConfig({
  isOnline,
  isSyncing,
  pendingCount,
  failedCount,
  lastSyncTime,
}: SyncStatusInputs): SyncStatusConfig {
  const hasPending = pendingCount > 0;

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

  if (failedCount > 0) {
    return {
      icon: AlertCircle,
      label: "Sync failed",
      sublabel: `${failedCount} ${failedCount === 1 ? "change" : "changes"} failed to sync`,
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
}

/**
 * GlobalSyncStatus Component
 *
 * Displays the overall sync status in the app header, showing:
 * - Online/offline status
 * - Number of items pending sync
 * - Number of items that failed to sync (red badge; wins over "All synced")
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
  const { isOnline, pendingCount, failedCount, isSyncing, lastSyncTime } = useSyncStatus();
  const [showQueue, setShowQueue] = useState(false);
  const queryClient = useQueryClient();
  const syncMutation = useSyncProcessor();

  // READ refresh for the detailed variant (review C4): pull-to-refresh is
  // disabled (overscroll-behavior: none) and standalone PWAs have no browser
  // reload button, so this is the explicit "re-fetch everything" affordance.
  // Marks EVERY query stale + refetching, and pushes the local outbox so the
  // refetch reflects local changes too (SyncQueueViewer's "Sync now" is the
  // WRITE half; this covers reads).
  const handleRefreshData = () => {
    void queryClient.invalidateQueries();
    syncMutation.mutate();
  };

  const hasFailures = failedCount > 0;
  const hasPending = pendingCount > 0;

  const status = getSyncStatusConfig({
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    lastSyncTime,
  });
  const Icon = status.icon;

  // Failure count wins over the pending count in the inline badge (review R3)
  const countBadge = hasFailures ? (
    <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
      {failedCount}
    </span>
  ) : hasPending ? (
    <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      {pendingCount}
    </span>
  ) : null;

  if (variant === "compact") {
    return (
      <>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn("min-h-11 min-w-11", className)}
                onClick={() => setShowQueue(true)}
                aria-label={`${status.label}: ${status.sublabel}`}
              >
                <Icon
                  className={cn("h-4 w-4", status.className, status.animate && "animate-spin")}
                  aria-hidden="true"
                />
                {countBadge}
              </Button>
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
          aria-label={`${status.label}: ${status.sublabel}`}
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
          {hasFailures ? (
            <div className="flex-shrink-0">
              <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                {failedCount} failed
              </span>
            </div>
          ) : hasPending ? (
            <div className="flex-shrink-0">
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {pendingCount} pending
              </span>
            </div>
          ) : null}
        </button>

        {/* Explicit refresh affordance (review C4) — visible wherever the
            detailed variant mounts (MobileNav drawer, settings) */}
        <Button
          variant="outline"
          size="sm"
          className="mt-2 min-h-11 w-full"
          onClick={handleRefreshData}
          disabled={syncMutation.isPending}
        >
          <RefreshCw
            className={cn("h-4 w-4", syncMutation.isPending && "animate-spin")}
            aria-hidden="true"
          />
          Refresh data
        </Button>

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
          {countBadge}
        </div>
      </button>
      <SyncQueueViewer open={showQueue} onOpenChange={setShowQueue} />
    </>
  );
}
