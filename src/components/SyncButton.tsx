import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";
import { useSyncStatus } from "@/hooks/useSyncStatus";

/**
 * SyncButton Component
 *
 * Manual sync trigger button with intelligent state handling:
 * - Disabled when offline
 * - Disabled when already syncing
 * - Disabled when no pending changes
 * - Shows spinning icon during sync
 * - Displays pending count in label
 *
 * Includes accessibility:
 * - Descriptive aria-label reflecting current state
 * - Clear disabled state messaging
 *
 * @example
 * ```tsx
 * <Header>
 *   <SyncButton />
 * </Header>
 * ```
 */
export function SyncButton() {
  const { mutate: sync, isPending } = useSyncProcessor();
  const { isOnline, pendingCount } = useSyncStatus();

  const getAriaLabel = () => {
    if (!isOnline) return "Sync disabled: offline";
    if (isPending) return "Syncing in progress";
    if (pendingCount === 0) return "Sync disabled: no changes to sync";
    return `Sync ${pendingCount} pending ${pendingCount === 1 ? "change" : "changes"}`;
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => sync()}
      disabled={!isOnline || isPending || pendingCount === 0}
      className="gap-2"
      aria-label={getAriaLabel()}
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      Sync {pendingCount > 0 && `(${pendingCount})`}
    </Button>
  );
}
