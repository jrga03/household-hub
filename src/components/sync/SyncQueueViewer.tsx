import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { RefreshCw, Trash2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { LoadingSpinner } from "@/components/LoadingScreen";
import { useAuthStore } from "@/stores/authStore";
import { getOutstandingQueueItems } from "@/lib/offline/syncQueue";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";
import {
  useRetrySyncItem,
  useDiscardSyncItem,
  useRetryAllFailed,
} from "@/hooks/useSyncQueueOperations";
import type { SyncQueueItem } from "@/types/sync";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface SyncQueueViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * SyncQueueViewer Component
 *
 * Displays all pending sync queue items in a side sheet/drawer.
 * Groups items by entity type and shows status, retry count, and actions.
 *
 * Features:
 * - Live outstanding-item list (Dexie useLiveQuery on the local outbox -
 *   updates the instant the queue changes, no polling)
 * - Grouped by entity type (transactions, accounts, categories)
 * - Explicit "Sync now" (drains the whole outbox via the sync processor)
 * - Retry failed items
 * - Discard stuck items (with confirmation)
 * - Shows error messages
 *
 * @example
 * const [isOpen, setIsOpen] = useState(false);
 * <SyncQueueViewer open={isOpen} onOpenChange={setIsOpen} />
 */
export function SyncQueueViewer({ open, onOpenChange }: SyncQueueViewerProps) {
  const user = useAuthStore((state) => state.user);
  const retryAllMutation = useRetryAllFailed();
  const syncMutation = useSyncProcessor();

  // Outstanding queue items (queued + syncing + failed) from the local
  // outbox - reactive IndexedDB read, no network involved (patterns:
  // TransactionList.tsx, useSyncStatus.ts). Gated on `open`: the viewer is
  // always-mounted by every GlobalSyncStatus instance (up to 3 concurrent),
  // so without the gate the whole queue would be re-read and re-sorted on
  // every db.syncQueue write while the sheet is closed.
  const liveItems = useLiveQuery(
    async () => (open && user?.id ? getOutstandingQueueItems(user.id) : []),
    [user?.id, open]
  );
  // Loading only matters while the sheet is open; closed viewers resolve to []
  const isLoading = liveItems === undefined;
  const items = liveItems ?? [];

  // Group items by entity type
  const groupedItems = items.reduce(
    (acc, item) => {
      const type = item.entity_type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(item);
      return acc;
    },
    {} as Record<string, SyncQueueItem[]>
  );

  const entityTypeLabels: Record<string, string> = {
    transaction: "Transactions",
    account: "Accounts",
    category: "Categories",
    budget: "Budgets",
  };

  // Count failed items
  const failedCount = items.filter((item) => item.status === "failed").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Sync Queue</SheetTitle>
          <SheetDescription>
            {items.length === 0
              ? "All changes are synced"
              : `${items.length} ${items.length === 1 ? "item" : "items"} waiting to sync`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner className="text-muted-foreground" label="Loading sync queue" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground mt-1">
                All your changes have been synced to the cloud
              </p>
            </div>
          ) : (
            Object.entries(groupedItems).map(([entityType, entityItems]) => (
              <div key={entityType}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  {entityTypeLabels[entityType] || entityType}
                  <Badge variant="secondary" className="ml-2">
                    {entityItems.length}
                  </Badge>
                </h3>
                <div className="space-y-2">
                  {entityItems.map((item) => (
                    <QueueItemCard key={item.id} item={item} />
                  ))}
                </div>
                <Separator className="mt-4" />
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-6 pt-4 border-t space-y-2">
            {failedCount > 0 && (
              <Button
                variant="default"
                className="w-full"
                onClick={() => retryAllMutation.mutate()}
                disabled={retryAllMutation.isPending}
              >
                <RefreshCw
                  className={cn("h-4 w-4 mr-2", retryAllMutation.isPending && "animate-spin")}
                />
                Retry All Failed ({failedCount})
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")} />
              {syncMutation.isPending ? "Syncing..." : "Sync now"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * QueueItemCard Component
 * Displays a single sync queue item with status and actions
 */
function QueueItemCard({ item }: { item: SyncQueueItem }) {
  // Use real mutation hooks
  const retryMutation = useRetrySyncItem();
  const discardMutation = useDiscardSyncItem();

  const handleDiscard = async () => {
    const confirmed = await confirm({
      title: "Discard this change?",
      description: "This action cannot be undone.",
      confirmLabel: "Discard",
      destructive: true,
    });
    if (confirmed) {
      discardMutation.mutate(item.id);
    }
  };

  const getStatusIcon = () => {
    if (item.status === "failed") {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    return <Clock className="h-4 w-4 text-amber-500" />;
  };

  const getOperationLabel = () => {
    const op = item.operation.op;
    return op.charAt(0).toUpperCase() + op.slice(1);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        item.status === "failed" &&
          "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon()}
            <span className="text-sm font-medium">{getOperationLabel()}</span>
            <Badge variant="outline" className="text-xs">
              {item.entity_type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            ID: {item.entity_id.slice(0, 20)}...
          </p>
          {item.retry_count > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Retry {item.retry_count} / {item.max_retries}
            </p>
          )}
          {item.error_message && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
              Error: {item.error_message}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {format(new Date(item.created_at), "MMM dd, HH:mm")}
          </p>
        </div>

        <div className="flex gap-1">
          {item.status === "failed" && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => retryMutation.mutate(item.id)}
              disabled={retryMutation.isPending}
              title="Retry now"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", retryMutation.isPending && "animate-spin")} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDiscard}
            disabled={discardMutation.isPending}
            title="Discard"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
