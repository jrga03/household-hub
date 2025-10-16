# Instructions: Conflict Detection

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Create Conflict Types (5 min)

**What You're Doing**: Defining TypeScript interfaces for conflict tracking and detection results.

Update `src/types/sync.ts` with conflict-related types:

```typescript
/**
 * Represents a detected conflict between local and remote versions
 * Stored in IndexedDB for review and resolution
 */
export interface Conflict {
  id: string;
  entityType: "transaction" | "account" | "category" | "budget";
  entityId: string;
  detectedAt: Date;
  localEvent: TransactionEvent;
  remoteEvent: TransactionEvent;
  resolution: "pending" | "resolved" | "manual";
  resolvedValue?: any;
  resolvedAt?: Date;
}

/**
 * Result of conflict detection between two events
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  reason?: string;
  comparison: ClockComparison;
}

/**
 * Statistics for conflict monitoring
 */
export interface ConflictStats {
  total: number;
  pending: number;
  resolved: number;
  byEntity: Record<string, number>;
}
```

**Verify**: No TypeScript errors in `src/types/sync.ts`

---

## Step 2: Create Conflict Detector (20 min)

**What You're Doing**: Building the core conflict detection engine that uses vector clocks to identify concurrent edits.

Create `src/lib/conflict-detector.ts`:

```typescript
import type { TransactionEvent, Conflict, ConflictDetectionResult } from "@/types/sync";
import { compareVectorClocks } from "./vector-clock";
import { db } from "./dexie";
import { nanoid } from "nanoid";

/**
 * Detect if two events conflict using vector clocks
 */
export function detectConflict(
  localEvent: TransactionEvent,
  remoteEvent: TransactionEvent
): ConflictDetectionResult {
  // Same entity?
  if (localEvent.entityId !== remoteEvent.entityId) {
    return { hasConflict: false, reason: "Different entities" };
  }

  // Compare vector clocks
  const comparison = compareVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock);

  if (comparison === "concurrent") {
    return {
      hasConflict: true,
      reason: "Concurrent edits detected",
      comparison,
    };
  }

  return { hasConflict: false, comparison };
}

/**
 * Log detected conflict for review and resolution
 */
export async function logConflict(
  localEvent: TransactionEvent,
  remoteEvent: TransactionEvent
): Promise<Conflict> {
  const conflict: Conflict = {
    id: nanoid(),
    entityType: localEvent.entityType as any,
    entityId: localEvent.entityId,
    detectedAt: new Date(),
    localEvent,
    remoteEvent,
    resolution: "pending",
  };

  // Store in IndexedDB
  await db.conflicts.add(conflict);

  // Update conflict store
  useConflictStore.getState().addConflict(conflict);

  console.warn("Conflict detected:", conflict);

  return conflict;
}

/**
 * Check if entity has pending conflicts
 */
export async function hasPendingConflicts(entityId: string): Promise<boolean> {
  const count = await db.conflicts
    .where("entityId")
    .equals(entityId)
    .and((c) => c.resolution === "pending")
    .count();

  return count > 0;
}

/**
 * Get all pending conflicts
 */
export async function getPendingConflicts(): Promise<Conflict[]> {
  return await db.conflicts.where("resolution").equals("pending").toArray();
}
```

---

## Step 3: Create Conflict Store (10 min)

Create `src/stores/conflictStore.ts`:

```typescript
import { create } from "zustand";
import type { Conflict } from "@/types/sync";

interface ConflictStore {
  conflicts: Conflict[];
  addConflict: (conflict: Conflict) => void;
  removeConflict: (conflictId: string) => void;
  clearConflicts: () => void;
  getPendingCount: () => number;
}

export const useConflictStore = create<ConflictStore>((set, get) => ({
  conflicts: [],

  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [...state.conflicts, conflict],
    })),

  removeConflict: (conflictId) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== conflictId),
    })),

  clearConflicts: () => set({ conflicts: [] }),

  getPendingCount: () => get().conflicts.filter((c) => c.resolution === "pending").length,
}));
```

---

## Step 4: Integrate with Sync Processor (15 min)

Update `src/lib/sync-processor.ts`:

```typescript
import { detectConflict, logConflict } from "./conflict-detector";

export async function processRemoteEvent(remoteEvent: TransactionEvent) {
  // Check if local version exists
  const localEvent = await db.events.where({ entityId: remoteEvent.entityId }).last();

  if (localEvent) {
    // Detect conflict
    const detection = detectConflict(localEvent, remoteEvent);

    if (detection.hasConflict) {
      // Log conflict
      await logConflict(localEvent, remoteEvent);

      // Resolve conflict (chunk 033)
      const resolved = await resolveConflict(localEvent, remoteEvent);
      await applyResolution(resolved);
      return;
    }
  }

  // No conflict - apply remote event
  await applyRemoteEvent(remoteEvent);
}
```

---

## Step 5: Update Dexie Schema (5 min)

Add conflicts table to `src/lib/dexie.ts`:

```typescript
this.version(N).stores({
  // ... existing tables ...
  conflicts: "id, entityId, resolution, detectedAt",
});
```

---

## Step 6: Create Unit Tests (15 min)

Create `src/lib/conflict-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectConflict } from "./conflict-detector";

describe("Conflict Detection", () => {
  it("should detect concurrent edits", () => {
    const localEvent = {
      entityId: "tx-123",
      vectorClock: { device1: 5, device2: 2 },
      // ... other fields
    };

    const remoteEvent = {
      entityId: "tx-123",
      vectorClock: { device1: 3, device2: 4 },
      // ... other fields
    };

    const result = detectConflict(localEvent, remoteEvent);

    expect(result.hasConflict).toBe(true);
    expect(result.reason).toBe("Concurrent edits detected");
  });

  it("should not detect conflict for sequential edits", () => {
    const localEvent = {
      entityId: "tx-123",
      vectorClock: { device1: 3, device2: 2 },
    };

    const remoteEvent = {
      entityId: "tx-123",
      vectorClock: { device1: 5, device2: 3 },
    };

    const result = detectConflict(localEvent, remoteEvent);

    expect(result.hasConflict).toBe(false);
  });

  it("should not detect conflict for different entities", () => {
    const localEvent = { entityId: "tx-A", vectorClock: { device1: 5 } };
    const remoteEvent = { entityId: "tx-B", vectorClock: { device1: 3 } };

    const result = detectConflict(localEvent, remoteEvent);

    expect(result.hasConflict).toBe(false);
    expect(result.reason).toBe("Different entities");
  });
});
```

---

## Step 7: Create Conflict Indicator Component (Optional) (10 min)

**What You're Doing**: Adding visual indicators for conflicts in the UI.

Create `src/components/ConflictIndicator.tsx`:

```typescript
import { useConflictStore } from "@/stores/conflictStore";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

export function ConflictIndicator() {
  const pendingCount = useConflictStore((state) => state.getPendingCount());

  if (pendingCount === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <span>{pendingCount} conflict{pendingCount > 1 ? 's' : ''}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h4 className="font-medium">Sync Conflicts Detected</h4>
          <p className="text-sm text-muted-foreground">
            {pendingCount} item{pendingCount > 1 ? 's' : ''} have conflicting changes
            from multiple devices. These will be resolved automatically using
            the latest timestamp.
          </p>
          <Button size="sm" className="w-full" asChild>
            <a href="/sync-status">View Details</a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

Add to your navigation or header:

```typescript
// In src/components/Layout.tsx or Header.tsx
import { ConflictIndicator } from "@/components/ConflictIndicator";

export function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      {/* ... other header content ... */}
      <ConflictIndicator />
    </header>
  );
}
```

---

## Step 8: Manual Testing in Browser (10 min)

**What You're Doing**: Simulating conflict scenarios to verify detection works.

### Test Case 1: Simulate Concurrent Edits

Open browser console and run:

```javascript
import { detectConflict, logConflict } from "@/lib/conflict-detector";
import { db } from "@/lib/dexie";

// Create two events simulating concurrent edits
const localEvent = {
  id: "evt-local-1",
  entityId: "tx-test-123",
  entityType: "transaction",
  op: "update",
  vectorClock: {
    "device-A": 5,
    "device-B": 2,
  },
  lamportClock: 5,
  payload: { amount_cents: 150000, description: "Local edit" },
  deviceId: "device-A",
  actorUserId: "user-1",
  timestamp: Date.now(),
  idempotencyKey: "device-A-transaction-tx-test-123-5",
};

const remoteEvent = {
  id: "evt-remote-1",
  entityId: "tx-test-123",
  entityType: "transaction",
  op: "update",
  vectorClock: {
    "device-A": 3,
    "device-B": 4,
  },
  lamportClock: 4,
  payload: { amount_cents: 200000, description: "Remote edit" },
  deviceId: "device-B",
  actorUserId: "user-1",
  timestamp: Date.now() - 1000,
  idempotencyKey: "device-B-transaction-tx-test-123-4",
};

// Detect conflict
const detection = detectConflict(localEvent, remoteEvent);
console.log("Detection result:", detection);
// Expected: { hasConflict: true, reason: "Concurrent edits detected", comparison: "concurrent" }

// Log conflict
if (detection.hasConflict) {
  await logConflict(localEvent, remoteEvent);
  console.log("Conflict logged successfully");
}

// Verify it's in IndexedDB
const conflicts = await db.conflicts.toArray();
console.log("Total conflicts:", conflicts.length);
console.log("Latest conflict:", conflicts[conflicts.length - 1]);
```

**Expected Output**:

```
Detection result: { hasConflict: true, reason: "Concurrent edits detected", comparison: "concurrent" }
Conflict logged successfully
Total conflicts: 1
Latest conflict: { id: "...", entityId: "tx-test-123", resolution: "pending", ... }
```

### Test Case 2: Sequential Edits (No Conflict)

```javascript
const sequential1 = {
  entityId: "tx-test-456",
  vectorClock: { "device-A": 3, "device-B": 2 },
};

const sequential2 = {
  entityId: "tx-test-456",
  vectorClock: { "device-A": 5, "device-B": 3 },
};

const result = detectConflict(sequential1, sequential2);
console.log("Sequential detection:", result);
// Expected: { hasConflict: false, comparison: "remote-ahead" }
```

### Test Case 3: Different Entities (No Conflict)

```javascript
const entity1 = {
  entityId: "tx-A",
  vectorClock: { "device-A": 5 },
};

const entity2 = {
  entityId: "tx-B",
  vectorClock: { "device-A": 3 },
};

const result = detectConflict(entity1, entity2);
console.log("Different entities:", result);
// Expected: { hasConflict: false, reason: "Different entities" }
```

---

## Step 9: Integration with Sync Flow (5 min)

**What You're Doing**: Ensuring conflict detection runs during normal sync operations.

Verify the sync processor includes conflict detection:

```typescript
// In src/lib/sync-processor.ts - should already be updated from Step 4

export async function processSyncBatch(remoteEvents: TransactionEvent[]) {
  for (const remoteEvent of remoteEvents) {
    try {
      // Get local version if exists
      const localEvents = await db.events.where("entityId").equals(remoteEvent.entityId).toArray();

      const latestLocal = localEvents[localEvents.length - 1];

      if (latestLocal) {
        // Detect conflict
        const detection = detectConflict(latestLocal, remoteEvent);

        if (detection.hasConflict) {
          console.warn("Conflict detected during sync:", {
            entityId: remoteEvent.entityId,
            comparison: detection.comparison,
          });

          // Log conflict
          await logConflict(latestLocal, remoteEvent);

          // Resolve conflict (chunk 033 will implement this)
          const resolved = await resolveConflict(latestLocal, remoteEvent);
          await applyResolvedEvent(resolved);
          continue;
        }

        // No conflict - check if remote is ahead
        if (detection.comparison === "remote-ahead") {
          await applyRemoteEvent(remoteEvent);
        }
        // If local-ahead, ignore remote (already synced)
      } else {
        // No local version - apply remote directly
        await applyRemoteEvent(remoteEvent);
      }
    } catch (err) {
      console.error("Error processing remote event:", err);
      // Continue with next event
    }
  }
}
```

**Test**: Trigger a sync and watch console for conflict detection logs.

---

## Step 10: Load Historical Conflicts (5 min)

**What You're Doing**: Loading existing conflicts into the store on app startup.

Add to your app initialization (e.g., `src/App.tsx` or `src/lib/init.ts`):

```typescript
import { db } from "@/lib/dexie";
import { useConflictStore } from "@/stores/conflictStore";

/**
 * Load conflicts from IndexedDB into Zustand store
 * Call this on app startup
 */
export async function loadConflicts() {
  const conflicts = await db.conflicts.toArray();

  conflicts.forEach((conflict) => {
    useConflictStore.getState().addConflict(conflict);
  });

  console.log(`Loaded ${conflicts.length} conflicts into store`);
}

// In App.tsx useEffect:
useEffect(() => {
  loadConflicts();
}, []);
```

---

## Done!

When all tests pass and conflicts are detected correctly, proceed to checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Common Patterns

### Pattern 1: Check Before Sync

```typescript
// Before syncing, check if entity has pending conflicts
import { hasPendingConflicts } from "@/lib/conflict-detector";

if (await hasPendingConflicts(entityId)) {
  console.warn("Entity has unresolved conflicts");
  // Maybe show warning to user
}
```

### Pattern 2: Conflict Count Badge

```typescript
// Show conflict count in UI
const ConflictBadge = () => {
  const count = useConflictStore(state => state.getPendingCount());
  return count > 0 ? <Badge variant="warning">{count}</Badge> : null;
};
```

### Pattern 3: Get Conflicts for Entity

```typescript
// Get all conflicts for a specific entity
async function getEntityConflicts(entityId: string) {
  return await db.conflicts.where("entityId").equals(entityId).toArray();
}
```

---

## Notes

**Performance**: Conflict detection is O(D) where D = number of devices (typically 2-5), so it's very fast (<1ms).

**Storage**: Conflicts are stored in IndexedDB for review. Consider periodic cleanup of resolved conflicts older than 90 days.

**Debugging**: Use browser DevTools → Application → IndexedDB → conflicts table to inspect stored conflicts.

**Error Handling**: Always wrap conflict detection in try-catch to prevent sync failures from blocking other operations.
