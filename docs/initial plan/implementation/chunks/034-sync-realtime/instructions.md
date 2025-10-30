# Instructions: Sync Realtime

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Create Realtime Sync Manager (30 min)

Create `src/lib/realtime-sync.ts`:

```typescript
import { supabase } from "./supabase";
import { db } from "./dexie";
import { detectConflict, logConflict } from "./conflict-detector";
import { conflictResolutionEngine } from "./conflict-resolver";

export class RealtimeSync {
  private subscription: any = null;

  async initialize(): Promise<void> {
    // Subscribe to transaction changes
    this.subscription = supabase
      .channel("transactions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
        },
        this.handleChange
      )
      .subscribe();
  }

  private handleChange = async (payload: any): Promise<void> => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case "INSERT":
        await this.handleInsert(newRecord);
        break;
      case "UPDATE":
        await this.handleUpdate(newRecord, oldRecord);
        break;
      case "DELETE":
        await this.handleDelete(oldRecord);
        break;
    }
  };

  private async handleInsert(record: any): Promise<void> {
    await db.transactions.add(record);
  }

  private async handleUpdate(newRecord: any, oldRecord: any): Promise<void> {
    const localRecord = await db.transactions.get(newRecord.id);

    if (localRecord) {
      // Detect conflict
      const localEvent = {
        /* create event from local */
      };
      const remoteEvent = {
        /* create event from remote */
      };

      const detection = detectConflict(localEvent, remoteEvent);

      if (detection.hasConflict) {
        const conflict = await logConflict(localEvent, remoteEvent);
        const resolution = await conflictResolutionEngine.resolveConflict(localEvent, remoteEvent);
        await conflictResolutionEngine.logResolution(conflict, resolution);
        await db.transactions.put(resolution.winner.payload);
        return;
      }
    }

    await db.transactions.put(newRecord);
  }

  private async handleDelete(record: any): Promise<void> {
    await db.transactions.delete(record.id);
  }

  async cleanup(): Promise<void> {
    if (this.subscription) {
      await supabase.removeChannel(this.subscription);
    }
  }
}

export const realtimeSync = new RealtimeSync();
```

---

## Step 2: Initialize Realtime Sync (10 min)

In your app initialization (`src/App.tsx` or similar):

```typescript
import { realtimeSync } from "@/lib/realtime-sync";

useEffect(() => {
  async function initSync() {
    await realtimeSync.initialize();
  }

  initSync();

  return () => {
    realtimeSync.cleanup();
  };
}, []);
```

---

## Step 3: Create Sync Indicator Component (15 min)

Create `src/components/SyncIndicator.tsx`:

```typescript
import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function SyncIndicator() {
  const [status, setStatus] = useState<"online" | "offline" | "syncing">("online");

  useEffect(() => {
    function handleOnline() {
      setStatus("online");
    }

    function handleOffline() {
      setStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm">
      {status === "online" && <Wifi className="w-4 h-4 text-green-500" />}
      {status === "offline" && <WifiOff className="w-4 h-4 text-red-500" />}
      {status === "syncing" && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />}
      <span>{status}</span>
    </div>
  );
}
```

---

## Step 4: Add Multiple Table Subscriptions (15 min)

**What You're Doing**: Expanding realtime sync to all entity types (accounts, categories, budgets).

Enhance `src/lib/realtime-sync.ts`:

```typescript
export class RealtimeSync {
  private subscriptions: Map<string, any> = new Map();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn("Realtime sync already initialized");
      return;
    }

    // Subscribe to all tables
    await Promise.all([
      this.subscribeToTable("transactions"),
      this.subscribeToTable("accounts"),
      this.subscribeToTable("categories"),
      this.subscribeToTable("budgets"),
    ]);

    this.isInitialized = true;
    console.log("Realtime sync initialized for all tables");
  }

  private async subscribeToTable(tableName: string): Promise<void> {
    const subscription = supabase
      .channel(`${tableName}-changes`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName,
        },
        (payload) => this.handleTableChange(tableName, payload)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`Subscribed to ${tableName}`);
        } else if (status === "CHANNEL_ERROR") {
          console.error(`Error subscribing to ${tableName}`);
        }
      });

    this.subscriptions.set(tableName, subscription);
  }

  private async handleTableChange(tableName: string, payload: RealtimePayload): Promise<void> {
    console.log(`Change on ${tableName}:`, payload.eventType);

    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case "INSERT":
        await this.handleInsert(tableName, newRecord);
        break;
      case "UPDATE":
        await this.handleUpdate(tableName, newRecord, oldRecord);
        break;
      case "DELETE":
        await this.handleDelete(tableName, oldRecord);
        break;
    }
  }

  private async handleInsert(tableName: string, record: any): Promise<void> {
    // Get appropriate Dexie table
    const table = db[tableName as keyof typeof db];

    // Check if already exists (avoid duplicate inserts)
    const existing = await table.get(record.id);
    if (existing) {
      console.log(`Record ${record.id} already exists in ${tableName}`);
      return;
    }

    await table.add(record);
    console.log(`Inserted record ${record.id} into ${tableName}`);
  }

  async cleanup(): Promise<void> {
    // Unsubscribe from all channels
    for (const [tableName, subscription] of this.subscriptions) {
      await supabase.removeChannel(subscription);
      console.log(`Unsubscribed from ${tableName}`);
    }

    this.subscriptions.clear();
    this.isInitialized = false;
  }
}
```

---

## Step 5: Add Connection Status Tracking (10 min)

**What You're Doing**: Tracking connection state for UI feedback.

Create `src/stores/syncStore.ts`:

```typescript
import { create } from "zustand";

interface SyncStore {
  status: "online" | "offline" | "syncing" | "error";
  lastSyncTime: Date | null;
  pendingChanges: number;

  setStatus: (status: "online" | "offline" | "syncing" | "error") => void;
  setLastSyncTime: (time: Date) => void;
  setPendingChanges: (count: number) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: "online",
  lastSyncTime: null,
  pendingChanges: 0,

  setStatus: (status) => set({ status }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setPendingChanges: (count) => set({ pendingChanges: count }),
}));
```

Update `RealtimeSync` to update store:

```typescript
import { useSyncStore } from "@/stores/syncStore";

export class RealtimeSync {
  // ... existing code

  private async subscribeToTable(tableName: string): Promise<void> {
    const subscription = supabase
      .channel(`${tableName}-changes`)
      .on(
        "postgres_changes",
        {
          /* ... */
        },
        this.handleTableChange
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`Subscribed to ${tableName}`);
          useSyncStore.getState().setStatus("online");
        } else if (status === "CHANNEL_ERROR") {
          console.error(`Error subscribing to ${tableName}`);
          useSyncStore.getState().setStatus("error");
        }
      });

    this.subscriptions.set(tableName, subscription);
  }

  private async handleTableChange(tableName, payload) {
    useSyncStore.getState().setStatus("syncing");

    try {
      // Process change...
      await this.processChange(tableName, payload);

      useSyncStore.getState().setStatus("online");
      useSyncStore.getState().setLastSyncTime(new Date());
    } catch (err) {
      console.error("Sync error:", err);
      useSyncStore.getState().setStatus("error");
    }
  }
}
```

---

## Step 6: Enhanced Sync Indicator (10 min)

**What You're Doing**: Creating a more informative sync status component.

Update `src/components/SyncIndicator.tsx`:

```typescript
import { useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, AlertCircle } from "lucide-react";
import { useSyncStore } from "@/stores/syncStore";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

export function SyncIndicator() {
  const { status, lastSyncTime, pendingChanges } = useSyncStore();

  useEffect(() => {
    function handleOnline() {
      useSyncStore.getState().setStatus("online");
    }

    function handleOffline() {
      useSyncStore.getState().setStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Set initial status
    useSyncStore.getState().setStatus(navigator.onLine ? "online" : "offline");

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const getIcon = () => {
    switch (status) {
      case "online":
        return <Wifi className="w-4 h-4 text-green-500" />;
      case "offline":
        return <WifiOff className="w-4 h-4 text-red-500" />;
      case "syncing":
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "online":
        return "Connected";
      case "offline":
        return "Offline";
      case "syncing":
        return "Syncing...";
      case "error":
        return "Sync Error";
    }
  };

  const getTooltipContent = () => {
    const parts = [getStatusText()];

    if (lastSyncTime) {
      const elapsed = Date.now() - lastSyncTime.getTime();
      const seconds = Math.floor(elapsed / 1000);
      parts.push(`Last sync: ${seconds}s ago`);
    }

    if (pendingChanges > 0) {
      parts.push(`${pendingChanges} pending changes`);
    }

    return parts.join("\n");
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            {getIcon()}
            <span className="text-sm text-muted-foreground">
              {getStatusText()}
            </span>
            {pendingChanges > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingChanges}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <pre className="text-xs whitespace-pre-wrap">
            {getTooltipContent()}
          </pre>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

---

## Step 7: Handle Reconnection (10 min)

**What You're Doing**: Implementing sync catch-up when connection is restored.

Add to `RealtimeSync`:

```typescript
export class RealtimeSync {
  // ... existing code

  async handleReconnection(): Promise<void> {
    console.log("Connection restored - catching up on missed changes");

    useSyncStore.getState().setStatus("syncing");

    try {
      // Process any queued local changes first
      await this.processSyncQueue();

      // Then fetch latest from server to catch up
      await this.fetchLatestChanges();

      useSyncStore.getState().setStatus("online");
      useSyncStore.getState().setLastSyncTime(new Date());
    } catch (err) {
      console.error("Reconnection catch-up failed:", err);
      useSyncStore.getState().setStatus("error");
    }
  }

  private async processSyncQueue(): Promise<void> {
    const queue = await db.sync_queue.toArray();

    for (const item of queue) {
      try {
        // Upload queued change to Supabase
        await this.uploadChange(item);
        await db.sync_queue.delete(item.id);
      } catch (err) {
        console.error("Failed to sync queued item:", err);
        // Leave in queue for retry
      }
    }

    const remaining = await db.sync_queue.count();
    useSyncStore.getState().setPendingChanges(remaining);
  }

  private async fetchLatestChanges(): Promise<void> {
    // Get last sync timestamp
    const lastSync = useSyncStore.getState().lastSyncTime;
    const since = lastSync || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Fetch changes since last sync
    const tables = ["transactions", "accounts", "categories", "budgets"];

    for (const tableName of tables) {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .gte("updated_at", since.toISOString());

      if (error) {
        console.error(`Failed to fetch ${tableName}:`, error);
        continue;
      }

      // Merge changes into IndexedDB
      for (const record of data || []) {
        await this.mergeRecord(tableName, record);
      }
    }
  }

  private async mergeRecord(tableName: string, record: any): Promise<void> {
    const table = db[tableName as keyof typeof db];
    const local = await table.get(record.id);

    if (!local) {
      // New record - add it
      await table.add(record);
    } else if (new Date(record.updated_at) > new Date(local.updated_at)) {
      // Remote is newer - update local
      await table.put(record);
    }
    // Else: local is newer or same - keep local
  }
}
```

Trigger on reconnection:

```typescript
// In App.tsx
useEffect(() => {
  function handleOnline() {
    realtimeSync.handleReconnection();
  }

  window.addEventListener("online", handleOnline);

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}, []);
```

---

## Step 8: Manual Testing (10 min)

**What You're Doing**: Verifying realtime sync works end-to-end.

### Test Case 1: Basic Realtime Sync

1. Open app in two browser tabs (Tab A and Tab B)
2. In Tab A, create a new transaction
3. **Expected**: Transaction appears in Tab B within 2 seconds

### Test Case 2: Concurrent Edits

1. Open app in two tabs
2. Edit the same transaction in both tabs simultaneously
3. **Expected**: Conflict detected and resolved automatically

### Test Case 3: Offline + Reconnection

1. Open app, disable network (DevTools → Network → Offline)
2. Create a transaction while offline
3. Re-enable network
4. **Expected**: Transaction syncs to server, appears on other devices

---

## Done!

When realtime sync is working and changes propagate across devices, proceed to checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Common Patterns

### Pattern 1: Debounced Updates

```typescript
// Avoid excessive updates for rapid changes
import { debounce } from "lodash-es";

const debouncedUpdate = debounce(async (record) => {
  await db.transactions.put(record);
}, 300);

private async handleUpdate(tableName, newRecord) {
  debouncedUpdate(newRecord);
}
```

### Pattern 2: Optimistic UI Updates

```typescript
// Update UI immediately, sync in background
async function createTransaction(data) {
  // Optimistically add to IndexedDB
  const id = await db.transactions.add(data);

  // Add to sync queue
  await db.sync_queue.add({
    operation: "create",
    table: "transactions",
    record: data,
  });

  // Background sync will handle upload
  return id;
}
```

### Pattern 3: Subscription Health Check

```typescript
// Periodically verify subscriptions are active
setInterval(() => {
  const channels = supabase.getChannels();

  if (channels.length === 0) {
    console.warn("No active subscriptions - reinitializing");
    realtimeSync.cleanup();
    realtimeSync.initialize();
  }
}, 60000); // Every minute
```

---

## Notes

**WebSocket Limits**: Supabase free tier allows up to 200 concurrent connections. For production, monitor connection count.

**Bandwidth**: Each change event is ~1KB. With 100 changes/minute, that's ~100KB/minute or ~6MB/hour.

**iOS Safari**: Background tabs may pause WebSocket connections. Implement focus-based reconnection:

```typescript
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    realtimeSync.handleReconnection();
  }
});
```

**Error Handling**: Always wrap realtime handlers in try-catch to prevent subscription crashes.
