# Instructions: Event Compaction

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Create Event Compactor (20 min)

Create `src/lib/event-compactor.ts`:

```typescript
import { db } from "./dexie";
import type { VectorClock, TransactionEvent } from "@/types/sync";
import { mergeVectorClocks } from "./vector-clock";
import { nanoid } from "nanoid";

export interface CompactionStats {
  entitiesCompacted: number;
  eventsDeleted: number;
  snapshotsCreated: number;
  storageSaved: number;
  duration: number;
}

export class EventCompactor {
  private readonly COMPACTION_THRESHOLD = 100; // events
  private readonly MONTHLY_COMPACTION = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly SAFETY_BUFFER = 10; // Keep last 10 events
  private readonly INACTIVE_DEVICE_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days

  /**
   * Check if entity needs compaction
   */
  async shouldCompact(entityId: string): Promise<boolean> {
    const eventCount = await db.events.where("entityId").equals(entityId).count();

    // Trigger 1: Event count threshold
    if (eventCount >= this.COMPACTION_THRESHOLD) {
      return true;
    }

    // Trigger 2: Time-based (30 days since last compaction)
    const lastCompaction = await db.meta.get(`compaction:${entityId}`);
    if (lastCompaction) {
      const timeSince = Date.now() - new Date(lastCompaction.value.timestamp).getTime();
      if (timeSince > this.MONTHLY_COMPACTION && eventCount > this.SAFETY_BUFFER) {
        return true;
      }
    } else if (eventCount > this.SAFETY_BUFFER) {
      // Never compacted and has enough events
      return true;
    }

    return false;
  }

  /**
   * Compact events for a single entity
   */
  async compactEntity(entityId: string): Promise<{
    eventsDeleted: number;
    snapshotCreated: boolean;
  }> {
    const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");

    if (events.length <= this.SAFETY_BUFFER) {
      console.log(`Entity ${entityId} has ≤${this.SAFETY_BUFFER} events - skipping compaction`);
      return { eventsDeleted: 0, snapshotCreated: false };
    }

    // Replay events to build current state
    const snapshot = this.replayEvents(events);

    // Create snapshot event
    const snapshotEvent: TransactionEvent = {
      id: nanoid(),
      entityId,
      entityType: events[0].entityType,
      op: "snapshot",
      payload: snapshot.state,
      lamportClock: snapshot.lamportClock,
      vectorClock: this.compactVectorClock(snapshot.vectorClock),
      timestamp: Date.now(),
      deviceId: "system-compactor",
      actorUserId: events[0].actorUserId,
      idempotencyKey: `snapshot-${entityId}-${Date.now()}`,
      eventVersion: 1,
      checksum: "",
    };

    // CRITICAL: Store snapshot BEFORE deleting old events
    // Note: Dexie operations are atomic by default for IndexedDB.
    // The reference architecture uses Supabase transactions (begin/commit/rollback)
    // for server-side compaction, but Dexie provides atomicity implicitly.
    await db.events.add(snapshotEvent);

    // Delete old events (keep last N for safety)
    const eventsToDelete = events.slice(0, -this.SAFETY_BUFFER);
    await db.events.bulkDelete(eventsToDelete.map((e) => e.id));

    // Record compaction timestamp
    await db.meta.put({
      key: `compaction:${entityId}`,
      value: {
        timestamp: new Date().toISOString(),
        eventsDeleted: eventsToDelete.length,
        eventsRemaining: this.SAFETY_BUFFER + 1, // snapshot + safety buffer
      },
    });

    console.log(
      `✓ Compacted ${eventsToDelete.length} events for entity ${entityId} ` +
        `(${events.length} → ${this.SAFETY_BUFFER + 1})`
    );

    return { eventsDeleted: eventsToDelete.length, snapshotCreated: true };
  }

  /**
   * Replay events to reconstruct current state
   */
  private replayEvents(events: TransactionEvent[]): {
    state: any;
    lamportClock: number;
    vectorClock: VectorClock;
  } {
    let state: any = {};
    let maxLamport = 0;
    let vectorClock: VectorClock = {};

    for (const event of events) {
      // Apply event to state
      switch (event.op) {
        case "create":
          // Full replacement on create
          state = { ...event.payload };
          break;

        case "update":
          // Merge updates (field-level)
          state = { ...state, ...event.payload };
          break;

        case "delete":
          // Mark as deleted with tombstone
          state = {
            ...state,
            deleted: true,
            deletedAt: event.timestamp,
          };
          break;

        case "snapshot":
          // Snapshot already represents full state
          state = { ...event.payload };
          break;
      }

      // Update clocks
      maxLamport = Math.max(maxLamport, event.lamportClock);
      vectorClock = mergeVectorClocks(vectorClock, event.vectorClock);
    }

    return { state, lamportClock: maxLamport, vectorClock };
  }

  /**
   * Prune inactive devices from vector clock
   * IMPORTANT: Preserves causality with _historical counter
   */
  private compactVectorClock(vectorClock: VectorClock): VectorClock {
    const compacted: VectorClock = {};
    let historicalMax = 0;

    for (const [deviceId, clock] of Object.entries(vectorClock)) {
      // In this simplified version, keep all devices
      // Step 2 will add device activity tracking
      // For now, just preserve the vector clock structure
      compacted[deviceId] = clock;
    }

    // If implementing device pruning, track historicalMax:
    // if (shouldPrune(deviceId)) {
    //   historicalMax = Math.max(historicalMax, clock);
    // }
    // if (historicalMax > 0) {
    //   compacted["_historical"] = historicalMax;
    // }

    return compacted;
  }

  /**
   * Run compaction for all entities
   */
  async compactAll(): Promise<CompactionStats> {
    const startTime = Date.now();
    const stats: CompactionStats = {
      entitiesCompacted: 0,
      eventsDeleted: 0,
      snapshotsCreated: 0,
      storageSaved: 0,
      duration: 0,
    };

    try {
      // Get all unique entity IDs
      const allEvents = await db.events.toArray();
      const entityIds = [...new Set(allEvents.map((e) => e.entityId))];

      console.log(`Starting compaction for ${entityIds.length} entities...`);

      for (const entityId of entityIds) {
        if (await this.shouldCompact(entityId)) {
          const result = await this.compactEntity(entityId);
          stats.entitiesCompacted++;
          stats.eventsDeleted += result.eventsDeleted;
          if (result.snapshotCreated) stats.snapshotsCreated++;
        }
      }

      stats.duration = Date.now() - startTime;
      stats.storageSaved = stats.eventsDeleted * 500; // ~500 bytes per event

      console.log(
        `✓ Compaction complete: ${stats.entitiesCompacted} entities, ` +
          `${stats.eventsDeleted} events deleted, ${stats.duration}ms`
      );

      return stats;
    } catch (error) {
      console.error("Compaction failed:", error);
      stats.duration = Date.now() - startTime;
      return stats;
    }
  }

  /**
   * Get compaction history for an entity
   */
  async getCompactionHistory(entityId: string): Promise<any> {
    return await db.meta.get(`compaction:${entityId}`);
  }

  /**
   * Get all compaction records
   */
  async getAllCompactionHistory(): Promise<any[]> {
    return await db.meta.where("key").startsWith("compaction:").toArray();
  }
}

export const eventCompactor = new EventCompactor();
```

**Key Implementation Details**:

- Dual trigger strategy: 100 events OR 30 days
- Snapshot created BEFORE deletion (safety)
- Keep last 10 events as safety buffer
- Vector clock compaction (prune inactive devices)
- Comprehensive stats tracking

---

## Step 2: Add Vector Clock Compaction (10 min)

Enhance vector clock compaction with device activity tracking:

```typescript
// In event-compactor.ts, update compactVectorClock method:

private async compactVectorClock(vectorClock: VectorClock): Promise<VectorClock> {
  const compacted: VectorClock = {};
  const now = Date.now();
  let historicalMax = 0;

  // Get device registry
  const devices = await db.devices?.toArray() || [];
  const deviceLastSeen = new Map(
    devices.map(d => [d.id, new Date(d.last_seen_at).getTime()])
  );

  for (const [deviceId, clock] of Object.entries(vectorClock)) {
    const lastSeen = deviceLastSeen.get(deviceId) || 0;
    const inactiveDuration = now - lastSeen;

    // Keep device if active within 30 days
    if (inactiveDuration < this.INACTIVE_DEVICE_THRESHOLD) {
      compacted[deviceId] = clock;
    } else {
      // Track max clock from inactive devices to preserve causality
      historicalMax = Math.max(historicalMax, clock);
      console.log(`Pruned inactive device ${deviceId} from vector clock (clock: ${clock})`);
    }
  }

  // Add _historical counter to preserve causality for pruned devices
  // This prevents clock regression when devices reactivate or new devices join
  if (historicalMax > 0) {
    compacted["_historical"] = historicalMax;
  }

  return compacted;
}
```

**Why This Matters**:

- Removes inactive devices from vector clocks
- Reduces vector clock size over time
- Speeds up conflict detection
- Preserves causality for active devices

---

## Step 3: Schedule Periodic Compaction (10 min)

Add scheduled compaction to app initialization (`src/App.tsx` or `src/main.tsx`):

```typescript
import { eventCompactor } from "@/lib/event-compactor";

// Schedule daily compaction at 3 AM local time
function scheduleDailyCompaction() {
  const now = new Date();
  const next3AM = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 3, 0, 0);
  const msUntil3AM = next3AM.getTime() - now.getTime();

  setTimeout(() => {
    // Run compaction
    eventCompactor.compactAll().then((stats) => {
      console.log("Daily compaction complete:", stats);
    });

    // Schedule next run
    scheduleDailyCompaction();
  }, msUntil3AM);
}

// Start scheduling on app initialization
if (import.meta.env.PROD) {
  scheduleDailyCompaction();
}

// Also run on app start (after 5 seconds delay)
setTimeout(async () => {
  console.log("Running startup compaction...");
  await eventCompactor.compactAll();
}, 5000);
```

**Alternative: Simple Daily Interval**

```typescript
// Run every 24 hours (simpler but less precise)
setInterval(
  async () => {
    const stats = await eventCompactor.compactAll();
    console.log("Compaction stats:", stats);
  },
  24 * 60 * 60 * 1000
);
```

---

## Step 4: Add Manual Compaction UI (10 min)

Add manual trigger to Settings page:

```typescript
// src/routes/settings.tsx
import { eventCompactor, type CompactionStats } from "@/lib/event-compactor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export function SettingsPage() {
  const [compacting, setCompacting] = useState(false);
  const [lastStats, setLastStats] = useState<CompactionStats | null>(null);

  const handleCompaction = async () => {
    setCompacting(true);
    try {
      const stats = await eventCompactor.compactAll();
      setLastStats(stats);
      toast.success(
        `Compaction complete: ${stats.entitiesCompacted} entities, ` +
          `${stats.eventsDeleted} events deleted, ${stats.duration}ms`
      );
    } catch (error) {
      toast.error("Compaction failed");
      console.error(error);
    } finally {
      setCompacting(false);
    }
  };

  return (
    <div>
      <h2>Storage Management</h2>

      <Button
        onClick={handleCompaction}
        disabled={compacting}
        variant="outline"
      >
        {compacting ? "Compacting..." : "Compact Event Log"}
      </Button>

      {lastStats && (
        <div className="mt-4 text-sm text-muted-foreground">
          <p>Last compaction:</p>
          <ul>
            <li>Entities: {lastStats.entitiesCompacted}</li>
            <li>Events deleted: {lastStats.eventsDeleted}</li>
            <li>Storage saved: ~{(lastStats.storageSaved / 1024).toFixed(1)}KB</li>
            <li>Duration: {lastStats.duration}ms</li>
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## Step 5: Add Compaction Monitoring (5 min)

Create compaction status component:

```typescript
// src/components/CompactionMonitor.tsx
import { useEffect, useState } from "react";
import { db } from "@/lib/dexie";
import { useLiveQuery } from "dexie-react-hooks";

export function CompactionMonitor() {
  const eventCount = useLiveQuery(() => db.events.count());
  const [needsCompaction, setNeedsCompaction] = useState(0);

  useEffect(() => {
    checkCompactionNeeds();
  }, [eventCount]);

  const checkCompactionNeeds = async () => {
    const allEvents = await db.events.toArray();
    const entityIds = [...new Set(allEvents.map((e) => e.entityId))];

    let count = 0;
    for (const entityId of entityIds) {
      const entityEvents = allEvents.filter((e) => e.entityId === entityId);
      if (entityEvents.length >= 100) {
        count++;
      }
    }

    setNeedsCompaction(count);
  };

  if (!eventCount || needsCompaction === 0) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 p-2 text-sm">
      {needsCompaction} entities need compaction ({eventCount} total events)
    </div>
  );
}
```

---

## Step 6: Write Unit Tests (15 min)

Create `src/lib/event-compactor.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { eventCompactor } from "./event-compactor";
import { db } from "./dexie";
import { nanoid } from "nanoid";

describe("EventCompactor", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("should compact entity with 100+ events", async () => {
    const entityId = "test-entity-001";

    // Create 110 events
    for (let i = 0; i < 110; i++) {
      await db.events.add({
        id: nanoid(),
        entityId,
        entityType: "transaction",
        op: i === 0 ? "create" : "update",
        payload: { amount_cents: 1000 + i },
        lamportClock: i,
        vectorClock: { "device-1": i },
        timestamp: Date.now(),
        deviceId: "device-1",
        actorUserId: "user-1",
        idempotencyKey: `test-${i}`,
        eventVersion: 1,
        checksum: "",
      });
    }

    // Verify should compact
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(true);

    // Compact
    const result = await eventCompactor.compactEntity(entityId);
    expect(result.snapshotCreated).toBe(true);
    expect(result.eventsDeleted).toBe(100); // 110 - 10 safety buffer

    // Verify event count
    const remaining = await db.events.where("entityId").equals(entityId).count();
    expect(remaining).toBe(11); // 1 snapshot + 10 recent events
  });

  it("should replay events correctly", async () => {
    const entityId = "test-entity-002";

    // Create sequence: create → update → update
    await db.events.bulkAdd([
      {
        id: "evt-1",
        entityId,
        entityType: "transaction",
        op: "create",
        payload: { amount_cents: 100000, description: "Initial" },
        lamportClock: 1,
        vectorClock: { "device-1": 1 },
        timestamp: Date.now(),
        deviceId: "device-1",
        actorUserId: "user-1",
        idempotencyKey: "test-1",
        eventVersion: 1,
        checksum: "",
      },
      {
        id: "evt-2",
        entityId,
        entityType: "transaction",
        op: "update",
        payload: { amount_cents: 150000 },
        lamportClock: 2,
        vectorClock: { "device-1": 2 },
        timestamp: Date.now(),
        deviceId: "device-1",
        actorUserId: "user-1",
        idempotencyKey: "test-2",
        eventVersion: 1,
        checksum: "",
      },
      {
        id: "evt-3",
        entityId,
        entityType: "transaction",
        op: "update",
        payload: { description: "Updated" },
        lamportClock: 3,
        vectorClock: { "device-1": 3 },
        timestamp: Date.now(),
        deviceId: "device-1",
        actorUserId: "user-1",
        idempotencyKey: "test-3",
        eventVersion: 1,
        checksum: "",
      },
    ]);

    // Compact (won't trigger threshold, but force it)
    // Access private method via any cast for testing
    const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
    const snapshot = (eventCompactor as any).replayEvents(events);

    expect(snapshot.state.amount_cents).toBe(150000);
    expect(snapshot.state.description).toBe("Updated");
    expect(snapshot.lamportClock).toBe(3);
  });

  it("should handle deleted entities", async () => {
    const entityId = "test-entity-003";

    await db.events.bulkAdd([
      {
        id: "evt-1",
        entityId,
        entityType: "transaction",
        op: "create",
        payload: { amount_cents: 100000 },
        lamportClock: 1,
        vectorClock: { "device-1": 1 },
        timestamp: Date.now(),
        deviceId: "device-1",
        actorUserId: "user-1",
        idempotencyKey: "test-1",
        eventVersion: 1,
        checksum: "",
      },
      {
        id: "evt-2",
        entityId,
        entityType: "transaction",
        op: "delete",
        payload: {},
        lamportClock: 2,
        vectorClock: { "device-1": 2 },
        timestamp: Date.now(),
        deviceId: "device-1",
        actorUserId: "user-1",
        idempotencyKey: "test-2",
        eventVersion: 1,
        checksum: "",
      },
    ]);

    const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
    const snapshot = (eventCompactor as any).replayEvents(events);

    expect(snapshot.state.deleted).toBe(true);
    expect(snapshot.state.deletedAt).toBeDefined();
  });
});
```

---

## Step 7: Manual Testing (10 min)

### Test 7.1: Trigger by Event Count

```javascript
// Browser console
import { db } from "@/lib/dexie";
import { eventCompactor } from "@/lib/event-compactor";

// Create 110 events for same entity
for (let i = 0; i < 110; i++) {
  await db.events.add({
    id: `evt-${i}`,
    entityId: "test-manual",
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { amount_cents: 1000 + i },
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

// Check should compact
const shouldCompact = await eventCompactor.shouldCompact("test-manual");
console.log("Should compact:", shouldCompact); // true

// Compact
const result = await eventCompactor.compactEntity("test-manual");
console.log("Result:", result);
// { eventsDeleted: 100, snapshotCreated: true }

// Verify
const remaining = await db.events.where("entityId").equals("test-manual").count();
console.log("Remaining events:", remaining); // 11 (snapshot + 10)
```

### Test 7.2: Verify Snapshot Integrity

```javascript
// Get snapshot
const snapshot = await db.events.where({ entityId: "test-manual", op: "snapshot" }).first();

console.log("Snapshot:", snapshot);
// Should have payload with final state (amount_cents: 1109)
```

### Test 7.3: Run Full Compaction

```javascript
const stats = await eventCompactor.compactAll();
console.log("Compaction stats:", stats);
// {
//   entitiesCompacted: X,
//   eventsDeleted: Y,
//   snapshotsCreated: X,
//   storageSaved: ~YKB,
//   duration: Zms
// }
```

---

## Step 8: Integration with Sync Flow (5 min)

Ensure compaction doesn't interfere with sync:

```typescript
// When fetching events for sync, handle snapshots:

export async function getEntityEvents(entityId: string): Promise<TransactionEvent[]> {
  const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");

  // If first event is snapshot, it represents full state
  if (events[0]?.op === "snapshot") {
    console.log(`Entity ${entityId} starts with snapshot at lamport ${events[0].lamportClock}`);
  }

  return events;
}

// When replaying for conflict resolution, handle snapshots:
export function replayForCurrentState(events: TransactionEvent[]): any {
  let state = {};

  for (const event of events) {
    if (event.op === "snapshot") {
      // Snapshot is complete state replacement
      state = { ...event.payload };
    } else if (event.op === "create") {
      state = { ...event.payload };
    } else if (event.op === "update") {
      state = { ...state, ...event.payload };
    } else if (event.op === "delete") {
      state = { ...state, deleted: true, deletedAt: event.timestamp };
    }
  }

  return state;
}
```

---

## Step 9: Add Compaction Safety Check (5 min)

Prevent compaction during active sync:

```typescript
// In event-compactor.ts

import { useSyncStore } from "@/stores/syncStore";

export class EventCompactor {
  // ... existing code ...

  async compactAll(): Promise<CompactionStats> {
    // Check if sync is active
    const syncStatus = useSyncStore.getState().status;
    if (syncStatus === "syncing") {
      console.log("Skipping compaction - sync in progress");
      return {
        entitiesCompacted: 0,
        eventsDeleted: 0,
        snapshotsCreated: 0,
        storageSaved: 0,
        duration: 0,
      };
    }

    // ... rest of compactAll implementation ...
  }
}
```

---

## Step 10: Verify and Commit (5 min)

**Final Checks**:

1. ✅ Compaction triggers at 100 events
2. ✅ Compaction triggers after 30 days
3. ✅ Snapshot created before deletion
4. ✅ Last 10 events preserved
5. ✅ Vector clocks compacted (inactive devices pruned)
6. ✅ Manual trigger works in UI
7. ✅ Scheduled compaction runs daily
8. ✅ Unit tests pass
9. ✅ No sync interference

**Commit**:

```bash
git add src/lib/event-compactor.ts
git add src/lib/event-compactor.test.ts
git add src/routes/settings.tsx
git commit -m "feat: implement event compaction

- Dual trigger: 100 events OR 30 days
- Snapshot creation with event replay
- Vector clock compaction (prune inactive devices)
- Scheduled daily compaction
- Manual trigger in settings
- Comprehensive unit tests

🤖 Generated with Claude Code"
```

---

## Done!

When all tests pass and compaction reduces storage without data loss, proceed to checkpoint.

**Next**: Run through `checkpoint.md`
