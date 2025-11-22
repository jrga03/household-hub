# Sync Management - Implementation Guide

## Prerequisites

- React 19+ with TypeScript
- TanStack Query v5+ for data fetching
- Supabase client configured
- IndexedDB/Dexie setup complete
- Sync engine and sync_queue table implemented
- shadcn/ui components available

## Overview

This guide implements comprehensive sync status visibility and queue management:

1. **SyncBadge** - Per-transaction status indicator
2. **GlobalSyncStatus** - Header sync indicator with 3 variants
3. **OfflineBanner** - Network status notification
4. **SyncQueueViewer** - Detailed queue management drawer
5. **Manual Operations** - Retry and discard functionality

---

## Phase 1: Create SyncBadge Component

### Step 1.1: Install Required Icons

```bash
# lucide-react should already be installed
# Verify these icons are available:
# Check, Clock, Loader2, AlertCircle
```

### Step 1.2: Create SyncBadge Component

**File:** `/src/components/sync/SyncBadge.tsx`

```typescript
import { Check, Clock, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type SyncStatus = "synced" | "pending" | "syncing" | "failed";

export interface SyncBadgeProps {
  status: SyncStatus;
  size?: "xs" | "sm" | "md";
  className?: string;
}

/**
 * SyncBadge Component
 *
 * Displays sync status icon with tooltip for individual items.
 * Shows one of four states: synced, pending, syncing, failed.
 *
 * @example
 * <SyncBadge status="synced" size="xs" />
 */
export function SyncBadge({ status, size = "sm", className }: SyncBadgeProps) {
  const sizeClasses = {
    xs: "h-3 w-3",
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
  };

  const statusConfig = {
    synced: {
      icon: Check,
      label: "Synced",
      tooltip: "Changes saved to cloud",
      className: "text-green-600 dark:text-green-500",
    },
    pending: {
      icon: Clock,
      label: "Pending",
      tooltip: "Waiting to sync",
      className: "text-amber-600 dark:text-amber-500",
    },
    syncing: {
      icon: Loader2,
      label: "Syncing",
      tooltip: "Syncing to cloud...",
      className: "text-blue-600 dark:text-blue-500 animate-spin",
    },
    failed: {
      icon: AlertCircle,
      label: "Failed",
      tooltip: "Sync failed - tap to retry",
      className: "text-red-600 dark:text-red-500",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="img"
            aria-label={`Sync status: ${config.label} - ${config.tooltip}`}
            className={cn("flex-shrink-0", className)}
          >
            <Icon
              className={cn(sizeClasses[size], config.className)}
              aria-hidden="true"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

### Step 1.3: Integrate into TransactionList

**File:** `/src/components/TransactionList.tsx`

```typescript
import { SyncBadge } from "@/components/sync/SyncBadge";

export function TransactionList({ transactions }: TransactionListProps) {
  return (
    <Table>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {transaction.description}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {transaction.category?.name}
                  </div>
                </div>
                <SyncBadge status="synced" size="xs" />
              </div>
            </TableCell>
            {/* Other cells... */}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**Note:** Status is hardcoded as "synced" for now. In Phase 4, we'll query sync_queue to determine actual status.

---

## Phase 2: Create GlobalSyncStatus Component

### Step 2.1: Create useSyncStatus Hook

**File:** `/src/hooks/useSyncStatus.ts`

```typescript
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPendingQueueItems } from "@/lib/offline/syncQueue";
import { useAuthStore } from "@/stores/authStore";

interface SyncStatusData {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
}

export function useSyncStatus(): SyncStatusData {
  const user = useAuthStore((state) => state.user);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Listen to online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Fetch pending queue items
  const { data: queueItems = [] } = useQuery({
    queryKey: ["offline", "sync", "queue", "count"],
    queryFn: () => (user?.id ? getPendingQueueItems(user.id) : []),
    enabled: !!user?.id,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const pendingCount = queueItems.length;
  const isSyncing = queueItems.some((item) => item.status === "syncing");

  // Get last sync time from local storage or meta table
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    const lastSync = localStorage.getItem("lastSyncTime");
    if (lastSync) {
      setLastSyncTime(new Date(lastSync));
    }
  }, [queueItems]); // Update when queue changes

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncTime,
  };
}
```

### Step 2.2: Create GlobalSyncStatus Component

**File:** `/src/components/sync/GlobalSyncStatus.tsx`

```typescript
import { useState } from "react";
import { Cloud, CloudOff, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { SyncQueueViewer } from "@/components/sync/SyncQueueViewer";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface GlobalSyncStatusProps {
  variant?: "default" | "compact" | "detailed";
  className?: string;
}

export function GlobalSyncStatus({
  variant = "default",
  className,
}: GlobalSyncStatusProps) {
  const { isOnline, pendingCount, isSyncing, lastSyncTime } = useSyncStatus();
  const [showQueue, setShowQueue] = useState(false);

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

  // Default variant (and detailed)
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
```

### Step 2.3: Add to AppLayout

**File:** `/src/components/layout/AppLayout.tsx`

```typescript
import { GlobalSyncStatus } from "@/components/sync/GlobalSyncStatus";

// In mobile header
<header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
  <div className="flex h-14 items-center px-4">
    {/* Hamburger menu... */}
    <div className="flex flex-1 items-center gap-2">
      {/* App title... */}
    </div>

    {/* Add Sync Status */}
    <GlobalSyncStatus variant="compact" />
  </div>
</header>
```

---

## Phase 3: Create OfflineBanner Component

### Step 3.1: Create OfflineBanner Component

**File:** `/src/components/sync/OfflineBanner.tsx`

```typescript
import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnectBanner, setShowReconnectBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);

      // Only show celebration if we were offline for meaningful duration
      if (wasOffline) {
        setShowReconnectBanner(true);
        setTimeout(() => setShowReconnectBanner(false), 3000);
      }

      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [wasOffline]);

  // Show reconnection celebration
  if (showReconnectBanner) {
    return (
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-50 bg-green-100 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800",
          "animate-in slide-in-from-top duration-200"
        )}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-green-900 dark:text-green-100">
            <Wifi className="h-4 w-4" />
            <span>You're back online! 🎉</span>
          </div>
        </div>
      </div>
    );
  }

  // Show offline banner
  if (!isOnline) {
    return (
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-50 bg-amber-100 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800",
          "animate-in slide-in-from-top duration-200"
        )}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
              <WifiOff className="h-4 w-4" />
              <span>You're offline. Changes will sync when you reconnect.</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOnline(true)} // Dismiss banner
              className="text-amber-900 dark:text-amber-100"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
```

### Step 3.2: Add to AppLayout

**File:** `/src/components/layout/AppLayout.tsx`

```typescript
import { OfflineBanner } from "@/components/sync/OfflineBanner";

// Add after header, before main content
<OfflineBanner />

<main id="main-content" className="flex-1">
  <Outlet />
</main>
```

**Important:** Add padding-top to main content to prevent overlap when banner shows:

```typescript
<main
  id="main-content"
  className={cn(
    "flex-1 transition-all duration-200",
    !navigator.onLine && "pt-12" // Space for offline banner
  )}
>
  <Outlet />
</main>
```

---

## Phase 4: Create Sync Queue Viewer

### Step 4.1: Create Sync Queue Operations

**File:** `/src/lib/offline/syncQueueOperations.ts`

```typescript
import { supabase } from "@/lib/supabase";
import { syncProcessor } from "@/lib/sync/processor";

export interface SyncQueueOperationResult {
  success: boolean;
  error?: string;
  count?: number;
}

export async function retrySyncQueueItem(
  itemId: string,
  userId: string
): Promise<SyncQueueOperationResult> {
  try {
    const { error } = await supabase
      .from("sync_queue")
      .update({
        status: "queued",
        retry_count: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("user_id", userId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Trigger sync processor
    await syncProcessor.processQueue(userId);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}

export async function retryAllFailedItems(userId: string): Promise<SyncQueueOperationResult> {
  try {
    const { data, error } = await supabase
      .from("sync_queue")
      .update({
        status: "queued",
        retry_count: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "failed")
      .select("id");

    if (error) {
      return { success: false, error: error.message };
    }

    const count = data?.length || 0;

    await syncProcessor.processQueue(userId);

    return { success: true, count };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}

export async function discardSyncQueueItem(
  itemId: string,
  userId: string
): Promise<SyncQueueOperationResult> {
  try {
    const { error } = await supabase
      .from("sync_queue")
      .delete()
      .eq("id", itemId)
      .eq("user_id", userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}
```

### Step 4.2: Create Mutation Hooks

**File:** `/src/hooks/useSyncQueueOperations.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  retrySyncQueueItem,
  retryAllFailedItems,
  discardSyncQueueItem,
} from "@/lib/offline/syncQueueOperations";

export function useRetrySyncItem() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return retrySyncQueueItem(itemId, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["sync-queue", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["offline", "sync", "queue", "count"] });
        toast.success("Retry initiated - syncing now...");
      } else {
        toast.error(result.error || "Failed to retry item");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to retry");
    },
  });
}

export function useRetryAllFailed() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      return retryAllFailedItems(user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["sync-queue", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["offline", "sync", "queue", "count"] });

        const count = result.count || 0;
        if (count > 0) {
          toast.success(`Retrying ${count} ${count === 1 ? "item" : "items"}...`);
        } else {
          toast.info("No failed items to retry");
        }
      } else {
        toast.error(result.error || "Failed to retry items");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to retry all");
    },
  });
}

export function useDiscardSyncItem() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return discardSyncQueueItem(itemId, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["sync-queue", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["offline", "sync", "queue", "count"] });
        toast.success("Item discarded");
      } else {
        toast.error(result.error || "Failed to discard item");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to discard");
    },
  });
}
```

### Step 4.3: Create SyncQueueViewer Component

**File:** `/src/components/sync/SyncQueueViewer.tsx`

```typescript
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { RefreshCw, Trash2, AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { getPendingQueueItems } from "@/lib/offline/syncQueue";
import { useRetrySyncItem, useDiscardSyncItem, useRetryAllFailed } from "@/hooks/useSyncQueueOperations";
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

export function SyncQueueViewer({ open, onOpenChange }: SyncQueueViewerProps) {
  const user = useAuthStore((state) => state.user);
  const retryAllMutation = useRetryAllFailed();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["sync-queue", "pending"],
    queryFn: () => (user?.id ? getPendingQueueItems(user.id) : []),
    enabled: !!user?.id && open,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

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
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                <RefreshCw className={cn("h-4 w-4 mr-2", retryAllMutation.isPending && "animate-spin")} />
                Retry All Failed ({failedCount})
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function QueueItemCard({ item }: { item: SyncQueueItem }) {
  const retryMutation = useRetrySyncItem();
  const discardMutation = useDiscardSyncItem();

  const handleDiscard = () => {
    if (window.confirm("Discard this change? This action cannot be undone.")) {
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
        item.status === "failed" && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
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
```

---

## Phase 5: Testing & Validation

### Step 5.1: Unit Tests

```typescript
// tests/components/sync/SyncBadge.test.tsx
describe("SyncBadge", () => {
  it("shows correct icon for each status", () => {
    const { rerender } = render(<SyncBadge status="synced" />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("Synced"));

    rerender(<SyncBadge status="pending" />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("Pending"));
  });
});

// tests/hooks/useSyncStatus.test.ts
describe("useSyncStatus", () => {
  it("reflects navigator.onLine state", () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.isOnline).toBe(navigator.onLine);
  });

  it("updates on offline event", () => {
    const { result } = renderHook(() => useSyncStatus());

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
  });
});
```

### Step 5.2: Integration Tests

```typescript
// tests/integration/sync-queue.test.tsx
test("retry failed item updates queue", async () => {
  server.use(
    http.get("/api/sync-queue", () => {
      return HttpResponse.json([
        { id: "1", status: "failed", entity_type: "transaction", operation: { op: "create" } },
      ]);
    })
  );

  render(<SyncQueueViewer open={true} onOpenChange={vi.fn()} />);

  const retryButton = await screen.findByTitle("Retry now");
  fireEvent.click(retryButton);

  await waitFor(() => {
    expect(screen.getByText("Retry initiated - syncing now...")).toBeVisible();
  });
});
```

### Step 5.3: E2E Tests

```typescript
// tests/e2e/sync-management.spec.ts
test("offline banner appears on disconnect", async ({ page }) => {
  await page.goto("/transactions");

  await page.context().setOffline(true);

  await expect(
    page.locator('text="You\'re offline. Changes will sync when you reconnect."')
  ).toBeVisible({ timeout: 1000 });
});

test("sync queue viewer shows pending items", async ({ page }) => {
  await page.goto("/transactions");

  // Click global sync status
  await page.click('[aria-label*="Sync status"]');

  // Should open queue viewer
  await expect(page.locator('text="Sync Queue"')).toBeVisible();
});
```

---

## Checklist

### Implementation Checklist

- [x] SyncBadge component created
- [x] GlobalSyncStatus component created with 3 variants
- [x] useSyncStatus hook implemented
- [x] OfflineBanner component created
- [x] SyncQueueViewer component created
- [x] Sync queue operations implemented
- [x] Retry/discard mutation hooks created
- [x] Components integrated into AppLayout
- [x] Unit tests written
- [x] Integration tests written
- [x] E2E tests written
- [x] Documentation updated

### Verification Checklist

- [ ] SyncBadge shows correct status for transactions
- [ ] GlobalSyncStatus updates when queue changes
- [ ] OfflineBanner appears within 1s of going offline
- [ ] Reconnection banner shows and auto-dismisses
- [ ] SyncQueueViewer opens when clicking GlobalSyncStatus
- [ ] Queue items grouped by entity type
- [ ] Retry button works and triggers sync
- [ ] Retry all failed button works
- [ ] Discard requires confirmation
- [ ] Queue auto-refreshes every 10 seconds
- [ ] All ARIA labels present
- [ ] Keyboard navigation works
- [ ] No console errors or warnings

---

## Troubleshooting

### Issue: "getPendingQueueItems is not defined"

**Solution:** Ensure you have the sync queue query function:

```typescript
// src/lib/offline/syncQueue.ts
export async function getPendingQueueItems(userId: string): Promise<SyncQueueItem[]> {
  const { data, error } = await supabase
    .from("sync_queue")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["queued", "syncing", "failed"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
```

### Issue: "Offline banner flickers on/off"

**Solution:** Debounce offline/online events:

```typescript
let offlineTimeout: NodeJS.Timeout | null = null;

const handleOffline = () => {
  offlineTimeout = setTimeout(() => {
    setIsOnline(false);
  }, 500); // 500ms debounce
};

const handleOnline = () => {
  if (offlineTimeout) {
    clearTimeout(offlineTimeout);
  }
  setIsOnline(true);
};
```

### Issue: "Queue viewer doesn't update after retry"

**Solution:** Ensure query invalidation happens after mutation:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["sync-queue", "pending"] });
  queryClient.invalidateQueries({ queryKey: ["offline", "sync", "queue", "count"] });
};
```

---

## Further Reading

- [Sync Engine Architecture](../../initial%20plan/SYNC-ENGINE.md)
- [TanStack Query Mutations](https://tanstack.com/query/latest/docs/react/guides/mutations)
- [React Query Invalidation](https://tanstack.com/query/latest/docs/react/guides/query-invalidation)
- [shadcn/ui Sheet Component](https://ui.shadcn.com/docs/components/sheet)

**Related Documentation:**

- [SYNC-MANAGEMENT.md](SYNC-MANAGEMENT.md) - Feature overview
- [SYNC-MANAGEMENT-DECISIONS.md](SYNC-MANAGEMENT-DECISIONS.md) - Design decisions
- [REACT-19-ENHANCEMENTS.md](../react-19-enhancements/REACT-19-ENHANCEMENTS.md) - Related UX improvements
