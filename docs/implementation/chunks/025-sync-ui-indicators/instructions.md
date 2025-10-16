# Instructions: Sync UI Indicators

Follow these steps in order. Estimated time: 45 minutes.

---

## Step 1: Create Sync Status Hook (15 min)

Create `src/hooks/useSyncStatus.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { getQueueCount } from "@/lib/offline/syncQueue";

export function useSyncStatus() {
  const user = useAuthStore((state) => state.user);
  const isOnline = useOnlineStatus();

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["sync-status", "pending-count"],
    queryFn: () => (user?.id ? getQueueCount(user.id) : 0),
    enabled: !!user?.id && isOnline,
    refetchInterval: 10000, // Refresh every 10s
  });

  return {
    isOnline,
    pendingCount,
    isSyncing: false, // Will add in Step 2
    lastSyncTime: null, // Will add in Step 3
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

---

## Step 2: Create Sync Status Badge (15 min)

Create `src/components/SyncStatus.tsx`:

```typescript
import { Loader2, Cloud, CloudOff, CheckCircle2 } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { Badge } from "@/components/ui/badge";

export function SyncStatus() {
  const { isOnline, pendingCount, isSyncing } = useSyncStatus();

  if (!isOnline) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <CloudOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  }

  if (isSyncing || pendingCount > 0) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        {pendingCount > 0 ? `${pendingCount} pending` : "Syncing..."}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5">
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
    <Alert variant="destructive" className="mb-4">
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

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => sync()}
      disabled={!isOnline || isPending || pendingCount === 0}
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      Sync {pendingCount > 0 && `(${pendingCount})`}
    </Button>
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
