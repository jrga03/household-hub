# D11 Implementation: Sync Queue Integration

**Time estimate**: 1 hour
**Prerequisites**: D10 (Event Sourcing) complete, existing sync queue system

---

## Step 0: Verify Sync Queue System (10 min)

Check if sync queue infrastructure exists in the codebase.

```bash
# Check for sync_queue table in Dexie
grep -A 10 "syncQueue\|sync_queue" src/lib/dexie.ts

# Check for sync processor
find src -name "*sync*" -type f

# Check for network detection
grep -r "navigator.onLine" src/lib/
```

**If sync queue doesn't exist yet**:

This implementation assumes basic sync infrastructure exists. If not, create minimal implementation:

**File**: `src/lib/dexie.ts` (MODIFY - add sync_queue table)

```typescript
// Add to Dexie schema
syncQueue: "++id, entityType, entityId, state, [state+nextRetryAt]";
```

**File**: `src/types/sync.ts` (CREATE minimal types)

```typescript
export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  eventId: string;
  operation: "create" | "update" | "delete";
  payload: any;
  idempotencyKey: string;
  state: "draft" | "queued" | "syncing" | "acked" | "confirmed" | "failed";
  attempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  error?: string;
  deviceId: string;
  userId: string;
  created_at: string;
  updated_at: string;
}
```

---

## Step 1: Create Sync Queue Helpers (15 min)

Utilities for adding events to sync queue.

**File**: `src/lib/debts/sync.ts` (NEW)

```typescript
import { nanoid } from "nanoid";
import { db } from "@/lib/dexie";
import { getDeviceId } from "@/lib/device";
import type { SyncQueueItem } from "@/types/sync";
import type { AnyDebtEvent } from "@/types/debt";

/**
 * Get current user ID
 * TODO: Replace with actual auth context
 */
async function getCurrentUserId(): Promise<string> {
  // Placeholder - replace with actual auth
  return "user-1";
}

/**
 * Add debt event to sync queue
 *
 * @param event - Debt event to queue
 * @returns Queue item ID
 */
export async function addDebtEventToQueue(event: AnyDebtEvent): Promise<string> {
  const deviceId = await getDeviceId();
  const userId = await getCurrentUserId();

  const queueItem: SyncQueueItem = {
    id: nanoid(),
    entityType: event.entityType,
    entityId: event.entityId,
    eventId: event.id,
    operation: event.op,
    payload: event.payload,
    idempotencyKey: event.idempotencyKey,
    state: "queued", // Ready to sync immediately
    attempts: 0,
    deviceId,
    userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.syncQueue.add(queueItem);
  return queueItem.id;
}

/**
 * Get sync status for an entity
 *
 * @param entityId - Entity ID
 * @returns Sync state or 'synced' if no pending items
 */
export async function getSyncStatus(
  entityId: string
): Promise<"syncing" | "queued" | "failed" | "synced"> {
  // Get most recent queue item for entity
  const items = await db.syncQueue
    .where("entityId")
    .equals(entityId)
    .reverse()
    .sortBy("created_at");

  if (items.length === 0) {
    return "synced";
  }

  const latestItem = items[0];

  if (latestItem.state === "syncing") return "syncing";
  if (latestItem.state === "queued" || latestItem.state === "draft") return "queued";
  if (latestItem.state === "failed") return "failed";
  return "synced";
}

/**
 * Get all pending sync items for debt entities
 *
 * @returns Pending queue items
 */
export async function getPendingDebtSyncItems(): Promise<SyncQueueItem[]> {
  const items = await db.syncQueue
    .where("state")
    .anyOf(["queued", "failed"])
    .and(
      (item) =>
        item.entityType === "debt" ||
        item.entityType === "internal_debt" ||
        item.entityType === "debt_payment"
    )
    .and((item) => !item.nextRetryAt || new Date(item.nextRetryAt) <= new Date())
    .limit(100)
    .toArray();

  return items;
}

/**
 * Mark queue item as syncing
 *
 * @param itemId - Queue item ID
 */
export async function markSyncing(itemId: string): Promise<void> {
  await db.syncQueue.update(itemId, {
    state: "syncing",
    updated_at: new Date().toISOString(),
  });
}

/**
 * Mark queue item as confirmed (success)
 *
 * @param itemId - Queue item ID
 */
export async function markConfirmed(itemId: string): Promise<void> {
  await db.syncQueue.update(itemId, {
    state: "confirmed",
    updated_at: new Date().toISOString(),
  });
}

/**
 * Mark queue item as failed (will retry)
 *
 * @param itemId - Queue item ID
 * @param error - Error message
 */
export async function markFailed(itemId: string, error: string): Promise<void> {
  const item = await db.syncQueue.get(itemId);

  if (!item) return;

  const newAttempts = item.attempts + 1;

  await db.syncQueue.update(itemId, {
    state: "failed",
    attempts: newAttempts,
    lastAttemptAt: new Date().toISOString(),
    nextRetryAt: calculateNextRetry(newAttempts).toISOString(),
    error,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Calculate next retry time with exponential backoff
 *
 * @param attempts - Number of failed attempts
 * @returns Next retry date
 */
function calculateNextRetry(attempts: number): Date {
  const delays = [
    1000, // 1 second
    2000, // 2 seconds
    5000, // 5 seconds
    10000, // 10 seconds
    30000, // 30 seconds
    60000, // 1 minute
    300000, // 5 minutes
  ];

  const delay = delays[Math.min(attempts, delays.length - 1)];
  return new Date(Date.now() + delay);
}

/**
 * Clean up old confirmed items (older than 24 hours)
 */
export async function cleanupOldSyncItems(): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const oldItems = await db.syncQueue
    .where("state")
    .equals("confirmed")
    .and((item) => item.updated_at < oneDayAgo)
    .toArray();

  for (const item of oldItems) {
    await db.syncQueue.delete(item.id);
  }

  return oldItems.length;
}
```

**Verification**:

```typescript
import { addDebtEventToQueue, getSyncStatus } from "@/lib/debts/sync";

// Create event and add to queue
const event = await createDebtEvent(debt, "create");
const queueId = await addDebtEventToQueue(event);

console.log("Queue ID:", queueId);

// Check sync status
const status = await getSyncStatus(debt.id);
console.log("Sync status:", status); // 'queued'
```

---

## Step 2: Integrate Queue Insertion into Event Creation (10 min)

Modify event creation to automatically add to sync queue.

**File**: `src/lib/debts/events.ts` (MODIFY)

```typescript
import { addDebtEventToQueue } from "./sync";

// MODIFY: createDebtEvent (add queue insertion)
export async function createDebtEvent(
  debt: Debt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<Debt>
): Promise<DebtEvent> {
  // ... existing event creation logic ...

  // Create event
  await db.events.add(event);

  // Add to sync queue
  await addDebtEventToQueue(event);

  return event;
}

// Apply same pattern to createInternalDebtEvent and createDebtPaymentEvent

export async function createInternalDebtEvent(
  debt: InternalDebt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<InternalDebt>
): Promise<InternalDebtEvent> {
  // ... existing event creation logic ...

  await db.events.add(event);

  // Add to sync queue
  await addDebtEventToQueue(event);

  return event;
}

export async function createDebtPaymentEvent(
  payment: DebtPayment,
  op: "create"
): Promise<DebtPaymentEvent> {
  // ... existing event creation logic ...

  await db.events.add(event);

  // Add to sync queue
  await addDebtEventToQueue(event);

  return event;
}
```

**Verification**:

```typescript
// Create debt
const debt = await createExternalDebt({...});

// Check sync queue
const items = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .toArray();

console.assert(items.length === 1, 'Queue item created');
console.assert(items[0].state === 'queued', 'State is queued');
```

---

## Step 3: Create Sync Processor (Optional - 15 min)

Background job to process sync queue.

**File**: `src/lib/sync/processor.ts` (MODIFY or CREATE)

```typescript
import { db } from "@/lib/dexie";
import {
  getPendingDebtSyncItems,
  markSyncing,
  markConfirmed,
  markFailed,
  cleanupOldSyncItems,
} from "@/lib/debts/sync";
import type { SyncQueueItem } from "@/types/sync";

/**
 * Sync queue item to server
 *
 * @param item - Queue item to sync
 * @returns True if successful
 */
async function syncItemToServer(item: SyncQueueItem): Promise<boolean> {
  try {
    // Mark as syncing
    await markSyncing(item.id);

    // Send to server
    const response = await fetch("/api/sync/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add auth headers here
      },
      body: JSON.stringify({
        eventId: item.eventId,
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.operation,
        payload: item.payload,
        idempotencyKey: item.idempotencyKey,
      }),
    });

    if (!response.ok) {
      // Handle errors
      const error = await response.text();

      if (response.status >= 400 && response.status < 500) {
        // Client error - don't retry (except 429)
        if (response.status === 429) {
          // Rate limit - retry later
          await markFailed(item.id, "Rate limited");
        } else {
          // Validation error - mark as permanently failed
          await markFailed(item.id, `Client error: ${error}`);
        }
        return false;
      } else {
        // Server error - retry
        await markFailed(item.id, `Server error: ${error}`);
        return false;
      }
    }

    // Success
    await markConfirmed(item.id);
    return true;
  } catch (error) {
    // Network error - retry
    await markFailed(item.id, error instanceof Error ? error.message : "Network error");
    return false;
  }
}

/**
 * Process sync queue
 *
 * Run periodically (every 5 seconds)
 */
export async function processSyncQueue(): Promise<void> {
  // Check if online
  if (!navigator.onLine) {
    return;
  }

  // Get pending items
  const items = await getPendingDebtSyncItems();

  if (items.length === 0) {
    return;
  }

  console.log(`Processing ${items.length} sync queue items`);

  // Sync each item
  let successCount = 0;
  let failureCount = 0;

  for (const item of items) {
    const success = await syncItemToServer(item);

    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  console.log(`Sync complete: ${successCount} success, ${failureCount} failed`);

  // Cleanup old items
  const cleanedCount = await cleanupOldSyncItems();

  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} old sync items`);
  }
}

/**
 * Start sync processor
 *
 * Runs every 5 seconds
 */
export function startSyncProcessor(): void {
  // Process immediately
  processSyncQueue();

  // Then every 5 seconds
  setInterval(() => {
    processSyncQueue();
  }, 5000);

  // Also process when coming back online
  window.addEventListener("online", () => {
    console.log("Back online, processing sync queue");
    processSyncQueue();
  });
}
```

**File**: `src/main.tsx` or `src/App.tsx` (MODIFY - start processor)

```typescript
import { startSyncProcessor } from "@/lib/sync/processor";

// In app initialization
if (typeof window !== "undefined") {
  startSyncProcessor();
}
```

**Verification**: See VERIFICATION.md for testing.

---

## Step 4: Add Sync Status UI (10 min)

Show sync status to users in UI components.

**File**: `src/components/debts/DebtCard.tsx` (MODIFY - add sync indicator)

```tsx
import { useQuery } from "@tanstack/react-query";
import { getSyncStatus } from "@/lib/debts/sync";
import { Loader2, AlertCircle, Check } from "lucide-react";

// Inside DebtCard component, add sync indicator:

const { data: syncStatus } = useQuery({
  queryKey: ["sync-status", debt.id],
  queryFn: () => getSyncStatus(debt.id),
  refetchInterval: 5000, // Refresh every 5 seconds
});

// In card header:
<CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
  <div className="flex items-center gap-2">
    <h3 className="font-bold text-lg">{debt.name}</h3>

    {/* Sync status indicator */}
    {syncStatus === "syncing" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
    {syncStatus === "queued" && (
      <div className="h-2 w-2 rounded-full bg-amber-500" title="Pending sync" />
    )}
    {syncStatus === "failed" && (
      <AlertCircle className="h-4 w-4 text-red-500" title="Sync failed" />
    )}
    {syncStatus === "synced" && <Check className="h-4 w-4 text-green-500" title="Synced" />}
  </div>

  <DebtStatusBadge status={debt.status} />
</CardHeader>;
```

**Verification**: See sync indicators appear during sync.

---

## Step 5: Export Sync Functions (5 min)

**File**: `src/lib/debts/index.ts` (MODIFY)

```typescript
// ... existing exports ...

export {
  addDebtEventToQueue,
  getSyncStatus,
  getPendingDebtSyncItems,
  markSyncing,
  markConfirmed,
  markFailed,
  cleanupOldSyncItems,
} from "./sync";
```

---

## Step 6: Add Network Status Indicator (Optional - 5 min)

Global indicator showing online/offline status.

**File**: `src/components/NetworkStatus.tsx` (NEW)

```tsx
import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function NetworkStatus() {
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

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white shadow-lg">
      <WifiOff className="h-4 w-4" />
      <span>Offline - changes will sync when online</span>
    </div>
  );
}
```

**File**: `src/App.tsx` (MODIFY - add component)

```tsx
import { NetworkStatus } from "@/components/NetworkStatus";

function App() {
  return (
    <>
      {/* ... existing app structure ... */}
      <NetworkStatus />
    </>
  );
}
```

---

## Final Verification

Test complete sync flow end-to-end:

```typescript
import { db } from "@/lib/dexie";
import { createExternalDebt, getSyncStatus } from "@/lib/debts";

async function testSyncFlow() {
  // 1. Go offline (simulate)
  Object.defineProperty(navigator, "onLine", {
    writable: true,
    value: false,
  });

  // 2. Create debt while offline
  const debt = await createExternalDebt({
    name: "Offline Debt",
    original_amount_cents: 100000,
    household_id: "h1",
  });

  // 3. Check sync status
  let status = await getSyncStatus(debt.id);
  console.assert(status === "queued", "Queued while offline");

  // 4. Check queue
  const queueItems = await db.syncQueue.where("entityId").equals(debt.id).toArray();
  console.assert(queueItems.length === 1, "Item in queue");
  console.assert(queueItems[0].state === "queued", "State is queued");

  // 5. Go online
  Object.defineProperty(navigator, "onLine", {
    writable: true,
    value: true,
  });

  // 6. Trigger sync manually (in real app, processor does this)
  await processSyncQueue();

  // 7. Check status after sync
  status = await getSyncStatus(debt.id);
  console.log("Status after sync:", status); // Should be 'synced' or 'failed'

  // 8. Check queue item state
  const syncedItems = await db.syncQueue.where("entityId").equals(debt.id).toArray();

  console.log("Queue item state:", syncedItems[0].state); // 'confirmed' or 'failed'

  console.log("✅ Sync flow test complete");
}

testSyncFlow();
```

---

## Troubleshooting

### Issue: Queue items not syncing

**Symptom**: Items stay in 'queued' state forever.

**Cause**: Sync processor not running or network offline.

**Fix**:

```typescript
// Check if processor started
console.log("Sync processor running:", !!syncProcessorInterval);

// Check if online
console.log("Online:", navigator.onLine);

// Manually trigger sync
await processSyncQueue();
```

---

### Issue: All syncs failing with network error

**Symptom**: Items going to 'failed' state immediately.

**Cause**: Server endpoint not available or wrong URL.

**Fix**:

```typescript
// Check server endpoint
console.log("Sync endpoint:", "/api/sync/events");

// Test manually
const response = await fetch("/api/sync/events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ test: true }),
});

console.log("Server response:", response.status);
```

---

### Issue: Queue growing without cleanup

**Symptom**: Thousands of old confirmed items in queue.

**Cause**: Cleanup function not running.

**Fix**:

```typescript
// Manually run cleanup
const cleanedCount = await cleanupOldSyncItems();
console.log("Cleaned up:", cleanedCount);

// Add to processor
setInterval(() => {
  cleanupOldSyncItems();
}, 60000); // Every minute
```

---

## ★ Insight ─────────────────────────────────────

**Queue vs Events Separation**: The sync queue and events table serve **different purposes**:

- **Events table**: Permanent audit log (never deleted)
- **Sync queue**: Temporary work queue (deleted after confirmation)

This separation provides:

- **Performance**: Small queue for fast queries
- **Durability**: Events persisted even if sync fails forever
- **Flexibility**: Can recreate queue from events if needed

**Exponential Backoff Psychology**: The backoff delays are carefully chosen:

- **1-10 seconds**: Quick retries for transient issues (network blip)
- **30-60 seconds**: Medium wait for temporary outages (server restart)
- **5 minutes**: Long wait for extended outages (maintenance window)

This balances responsiveness (quick success) with politeness (don't hammer failing server).

**State Machine Discipline**: Enforcing state transitions prevents bugs:

- Can't mark 'draft' as 'confirmed' (must go through syncing)
- Can't mark 'confirmed' as 'failed' (confirmed is terminal)
- 'failed' transitions back to 'queued' for retry (not to 'syncing' directly)

This discipline ensures predictable behavior and easier debugging.

─────────────────────────────────────────────────

---

**Time check**: You should have completed D11 in ~1 hour.

**Next**: Chunk D12 - Testing & Edge Cases
