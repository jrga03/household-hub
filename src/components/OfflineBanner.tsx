import { useState, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";

/**
 * OfflineBanner Component
 *
 * Alert banner displayed when app is offline.
 * Features:
 * - Auto-hides when back online
 * - Shows pending sync count
 * - Manual sync retry button
 * - Dismissible (resets when back online)
 *
 * Uses Alert component for consistent styling and accessibility.
 *
 * @example
 * ```tsx
 * <App>
 *   <OfflineBanner />
 *   <RouterProvider />
 * </App>
 * ```
 */
export function OfflineBanner() {
  const { isOnline, pendingCount } = useSyncStatus();
  const { mutate: sync, isPending } = useSyncProcessor();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when back online
  useEffect(() => {
    if (isOnline) setDismissed(false);
  }, [isOnline]);

  if (isOnline || dismissed) return null;

  return (
    <Alert
      variant="destructive"
      className="mb-4"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          You're offline. {pendingCount > 0 && `${pendingCount} changes will sync when online.`}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => sync()}
            disabled={!isOnline || isPending}
            title={!isOnline ? "Cannot sync while offline" : "Retry sync now"}
            aria-label={!isOnline ? "Sync disabled: offline" : "Retry syncing now"}
          >
            {isPending ? "Retrying..." : "Retry"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss offline notice"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
