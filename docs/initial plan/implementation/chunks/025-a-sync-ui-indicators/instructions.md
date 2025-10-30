# Instructions: Sync UI Indicators

Follow these steps in order. Estimated time: 45 minutes.

---

## Step 1: Create Sync Status Hook (15 min)

Create `src/hooks/useSyncStatus.ts`:

```typescript
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { getQueueCount } from "@/lib/offline/syncQueue";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";

export function useSyncStatus() {
  const user = useAuthStore((state) => state.user);
  const isOnline = useOnlineStatus();
  const { isPending: isSyncing } = useSyncProcessor();

  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
    const stored = localStorage.getItem("lastSyncTime");
    return stored ? new Date(stored) : null;
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["sync-status", "pending-count"],
    queryFn: () => (user?.id ? getQueueCount(user.id) : 0),
    enabled: !!user?.id && isOnline,
    refetchInterval: 10000, // Refresh every 10s
  });

  // Update last sync time when queue empties
  useEffect(() => {
    if (pendingCount === 0 && !isSyncing && isOnline) {
      const now = new Date();
      setLastSyncTime(now);
      localStorage.setItem("lastSyncTime", now.toISOString());
    }
  }, [pendingCount, isSyncing, isOnline]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncTime,
  };
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  return isOnline;
}
```

### Optional: Extract useOnlineStatus Hook

For better reusability and testing, consider extracting `useOnlineStatus` to a separate file:

**Create** `src/hooks/useOnlineStatus.ts`:

```typescript
import { useState, useEffect } from "react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  return isOnline;
}
```

Then import in `useSyncStatus.ts`:

```typescript
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function useSyncStatus() {
  const user = useAuthStore((state) => state.user);
  const isOnline = useOnlineStatus(); // Use extracted hook
  const { isPending: isSyncing } = useSyncProcessor();

  // ... rest of implementation
}
```

**Benefits**:

- Reusable across other components
- Easier to test in isolation
- Clearer separation of concerns

---

## Step 2: Create Sync Status Badge (15 min)

Create `src/components/SyncStatus.tsx`:

```typescript
import { Loader2, Cloud, CloudOff, CheckCircle2 } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { Badge } from "@/components/ui/badge";

export function SyncStatus() {
  const { isOnline, pendingCount, isSyncing } = useSyncStatus();

  // Helper for screen readers
  const getAriaLabel = () => {
    if (!isOnline) return "Sync status: offline";
    if (isSyncing || pendingCount > 0) {
      return `Sync status: syncing ${pendingCount} ${pendingCount === 1 ? 'item' : 'items'}`;
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
      aria-label={getAriaLabel()}
    >
      <CheckCircle2 className="h-3 w-3 text-green-600" />
      Synced
    </Badge>
  );
}
```

---

## Step 3: Create Offline Banner (10 min)

Create `src/components/OfflineBanner.tsx`:

```typescript
import { useState, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";

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
    >
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          You're offline. {pendingCount > 0 && `${pendingCount} changes will sync when online.`}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => sync()} disabled={isPending}>
            {isPending ? "Retrying..." : "Retry"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

---

## Step 4: Create Sync Button (5 min)

Create `src/components/SyncButton.tsx`:

```typescript
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";
import { useSyncStatus } from "@/hooks/useSyncStatus";

export function SyncButton() {
  const { mutate: sync, isPending } = useSyncProcessor();
  const { isOnline, pendingCount } = useSyncStatus();

  const getAriaLabel = () => {
    if (!isOnline) return "Sync disabled: offline";
    if (isPending) return "Syncing in progress";
    if (pendingCount === 0) return "Sync disabled: no changes to sync";
    return `Sync ${pendingCount} pending ${pendingCount === 1 ? 'change' : 'changes'}`;
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
```

---

## Step 4b: Add Toast Notifications (5 min)

Toast notifications provide immediate feedback for sync operations.

### Option 1: Add to useSyncProcessor Hook (Recommended)

Update `src/hooks/useSyncProcessor.ts` (from Chunk 024) to include toast feedback:

```typescript
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { syncProcessor } from "@/lib/offline/syncProcessor";

export function useSyncProcessor() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      return syncProcessor.processQueue(user.id);
    },
    onSuccess: (result) => {
      // Show success toast
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} ${result.synced === 1 ? "item" : "items"}`);
      }

      // Show warning if some failed
      if (result.failed > 0) {
        toast.error(`${result.failed} ${result.failed === 1 ? "item" : "items"} failed to sync`);
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error) => {
      toast.error("Sync failed: " + error.message);
    },
  });
}
```

### Option 2: Add to SyncButton Component

Alternatively, add toast feedback directly in the button component:

```typescript
import { useEffect } from "react";
import { toast } from "sonner";

export function SyncButton() {
  const { mutate: sync, isPending, isSuccess, isError } = useSyncProcessor();
  const { isOnline, pendingCount } = useSyncStatus();

  // Show toast on success
  useEffect(() => {
    if (isSuccess) {
      toast.success("Sync completed successfully");
    }
  }, [isSuccess]);

  // Show toast on error
  useEffect(() => {
    if (isError) {
      toast.error("Sync failed. Please try again.");
    }
  }, [isError]);

  const getAriaLabel = () => {
    if (!isOnline) return "Sync disabled: offline";
    if (isPending) return "Syncing in progress";
    if (pendingCount === 0) return "Sync disabled: no changes to sync";
    return `Sync ${pendingCount} pending ${pendingCount === 1 ? 'change' : 'changes'}`;
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
```

**Note**: Ensure `<Toaster />` is added to your app layout (usually in `App.tsx` or root route):

```typescript
import { Toaster } from "sonner";

export function App() {
  return (
    <>
      {/* Your app content */}
      <Toaster position="bottom-right" />
    </>
  );
}
```

---

## Step 5: Add to Layout (5 min)

Add components to app layout:

```typescript
// In your app layout or dashboard header
import { SyncStatus } from "@/components/SyncStatus";
import { SyncButton } from "@/components/SyncButton";
import { OfflineBanner } from "@/components/OfflineBanner";

export function AppLayout() {
  return (
    <div>
      <header className="flex items-center justify-between">
        <h1>Household Hub</h1>
        <div className="flex items-center gap-3">
          <SyncStatus />
          <SyncButton />
        </div>
      </header>

      <main>
        <OfflineBanner />
        {/* Your app content */}
      </main>
    </div>
  );
}
```

---

## Done!

**Next**: Run through `checkpoint.md` to verify UI works.

**🎉 MILESTONE 3 COMPLETE** - Offline functionality fully implemented!
