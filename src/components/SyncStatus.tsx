import { Loader2, CloudOff, CheckCircle2 } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { Badge } from "@/components/ui/badge";

/**
 * SyncStatus Component
 *
 * Visual indicator showing current sync state with three variants:
 * - Offline: Red badge with CloudOff icon
 * - Syncing: Spinner with pending count or "Syncing..." text
 * - Synced: Green checkmark with "Synced" text
 *
 * Includes accessibility features:
 * - role="status" for live region
 * - aria-live="polite" for non-intrusive updates
 * - Descriptive aria-label for screen readers
 *
 * @example
 * ```tsx
 * <Header>
 *   <SyncStatus />
 * </Header>
 * ```
 */
export function SyncStatus() {
  const { isOnline, pendingCount, isSyncing } = useSyncStatus();

  // Helper for screen readers
  const getAriaLabel = () => {
    if (!isOnline) return "Sync status: offline";
    if (isSyncing || pendingCount > 0) {
      return `Sync status: syncing ${pendingCount} ${pendingCount === 1 ? "item" : "items"}`;
    }
    return "Sync status: synced";
  };

  if (!isOnline) {
    return (
      <Badge
        variant="destructive"
        className="gap-1.5"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={getAriaLabel()}
      >
        <CloudOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  }

  if (isSyncing || pendingCount > 0) {
    return (
      <Badge
        variant="secondary"
        className="gap-1.5"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={getAriaLabel()}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {pendingCount > 0 ? `${pendingCount} pending` : "Syncing..."}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1.5"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={getAriaLabel()}
    >
      <CheckCircle2 className="h-3 w-3 text-green-600" />
      Synced
    </Badge>
  );
}
