# Instructions: Conflict Resolution

Follow these steps in order. Estimated time: 1.5 hours.

---

## Step 1: Create Resolution Types (5 min)

Create `src/types/resolution.ts`:

```typescript
import type { TransactionEvent } from "@/types/sync";

export type ResolutionStrategy = "record-lww" | "delete-wins" | "manual";

export interface ResolutionResult {
  winner: TransactionEvent;
  loser: TransactionEvent;
  strategy: ResolutionStrategy;
  reason: string;
  mergedPayload?: any;
}
```

---

## Step 2: Create Conflict Resolver (40 min)

Create `src/lib/conflict-resolver.ts`:

```typescript
import type { TransactionEvent, Conflict } from "@/types/sync";
import type { ResolutionResult, ResolutionStrategy } from "@/types/resolution";
import { db } from "./dexie";

/**
 * Conflict Resolution Engine (Phase B: Record-level LWW)
 *
 * Per Decision #85:
 * - Phase B uses record-level Last-Write-Wins
 * - Field-level merge deferred to Phase C or "when needed"
 */
export class ConflictResolutionEngine {
  /**
   * Resolve conflict using Phase B strategy (record-level LWW)
   */
  async resolveConflict(
    localEvent: TransactionEvent,
    remoteEvent: TransactionEvent
  ): Promise<ResolutionResult> {
    // Special case: DELETE always wins
    if (localEvent.op === "delete" || remoteEvent.op === "delete") {
      return this.resolveDeleteConflict(localEvent, remoteEvent);
    }

    // Default: Record-level Last-Write-Wins
    return this.resolveRecordLWW(localEvent, remoteEvent);
  }

  /**
   * Record-level Last-Write-Wins using server timestamps
   */
  private resolveRecordLWW(
    localEvent: TransactionEvent,
    remoteEvent: TransactionEvent
  ): ResolutionResult {
    // Use lamport clock + deviceId for deterministic tie-breaking
    const localOrder = `${localEvent.lamportClock}-${localEvent.deviceId}`;
    const remoteOrder = `${remoteEvent.lamportClock}-${remoteEvent.deviceId}`;

    const winner = localOrder > remoteOrder ? localEvent : remoteEvent;
    const loser = winner === localEvent ? remoteEvent : localEvent;

    return {
      winner,
      loser,
      strategy: "record-lww",
      reason: `Record-level LWW: ${winner === localEvent ? "local" : "remote"} has higher lamport clock`,
    };
  }

  /**
   * DELETE always wins over UPDATE
   */
  private resolveDeleteConflict(
    localEvent: TransactionEvent,
    remoteEvent: TransactionEvent
  ): ResolutionResult {
    const deleteEvent = localEvent.op === "delete" ? localEvent : remoteEvent;
    const otherEvent = deleteEvent === localEvent ? remoteEvent : localEvent;

    return {
      winner: deleteEvent,
      loser: otherEvent,
      strategy: "delete-wins",
      reason: "DELETE operation always takes precedence",
    };
  }

  /**
   * Log resolution for transparency
   */
  async logResolution(conflict: Conflict, result: ResolutionResult): Promise<void> {
    // Update conflict record
    await db.conflicts.update(conflict.id, {
      resolution: "resolved",
      resolvedValue: result.winner.payload,
      resolvedAt: new Date(),
    });

    console.log("Conflict resolved:", {
      entityId: conflict.entityId,
      strategy: result.strategy,
      winner: result.winner === conflict.localEvent ? "local" : "remote",
    });
  }
}

// Singleton instance
export const conflictResolutionEngine = new ConflictResolutionEngine();
```

---

## Step 3: Integrate with Sync Processor (20 min)

Update sync processor to use resolver:

```typescript
import { conflictResolutionEngine } from "./conflict-resolver";
import { detectConflict, logConflict } from "./conflict-detector";

export async function processRemoteEvent(remoteEvent: TransactionEvent) {
  const localEvent = await getLocalEvent(remoteEvent.entityId);

  if (localEvent) {
    const detection = detectConflict(localEvent, remoteEvent);

    if (detection.hasConflict) {
      // Log conflict
      const conflict = await logConflict(localEvent, remoteEvent);

      // Resolve conflict
      const resolution = await conflictResolutionEngine.resolveConflict(localEvent, remoteEvent);

      // Log resolution
      await conflictResolutionEngine.logResolution(conflict, resolution);

      // Apply winner
      await applyResolvedEvent(resolution.winner);
      return;
    }
  }

  // No conflict - apply remote
  await applyRemoteEvent(remoteEvent);
}
```

---

## Step 4: Create Unit Tests (20 min)

Create `src/lib/conflict-resolver.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ConflictResolutionEngine } from "./conflict-resolver";

const resolver = new ConflictResolutionEngine();

describe("Conflict Resolution", () => {
  it("should resolve record-level LWW based on lamport clock", async () => {
    const local = {
      entityId: "tx-123",
      op: "update",
      lamportClock: 5,
      deviceId: "device-A",
      payload: { amount: 1000 },
    };

    const remote = {
      entityId: "tx-123",
      op: "update",
      lamportClock: 3,
      deviceId: "device-B",
      payload: { amount: 2000 },
    };

    const result = await resolver.resolveConflict(local, remote);

    expect(result.winner).toBe(local); // Higher lamport wins
    expect(result.strategy).toBe("record-lww");
  });

  it("should use deviceId for tie-breaking", async () => {
    const local = {
      entityId: "tx-123",
      lamportClock: 5,
      deviceId: "device-B",
      payload: {},
    };

    const remote = {
      entityId: "tx-123",
      lamportClock: 5,
      deviceId: "device-A",
      payload: {},
    };

    const result = await resolver.resolveConflict(local, remote);

    // "device-B" > "device-A" lexicographically
    expect(result.winner).toBe(local);
  });

  it("should prioritize DELETE over UPDATE", async () => {
    const local = {
      entityId: "tx-123",
      op: "update",
      lamportClock: 10,
      payload: { amount: 1000 },
    };

    const remote = {
      entityId: "tx-123",
      op: "delete",
      lamportClock: 5,
      payload: {},
    };

    const result = await resolver.resolveConflict(local, remote);

    expect(result.winner).toBe(remote); // DELETE wins despite lower lamport
    expect(result.strategy).toBe("delete-wins");
  });
});
```

---

## Step 5: Document Field-Level Rules for Phase C (10 min)

Create `src/lib/conflict-resolution-rules.md` (documentation for future):

```markdown
# Field-Level Conflict Resolution Rules (Phase C)

**Status**: Deferred per Decision #85

Phase B uses record-level LWW. If field-level merge is needed in future:

## Rules by Entity Type

### Transactions

- `amount_cents`: last-write-wins
- `description`: last-write-wins
- `status`: "cleared" wins over "pending"
- `notes`: concatenate with separator
- `deleted`: delete-wins

### Accounts

- `name`: last-write-wins
- `is_active`: false wins (deactivation priority)

### Categories

- Similar to accounts

See SYNC-ENGINE.md lines 365-514 for complete matrix.
```

---

## Step 6: Manual Testing in Browser (15 min)

**What You're Doing**: Simulating conflict scenarios to verify resolution works correctly.

### Test Case 1: Record-Level LWW

```javascript
import { ConflictResolutionEngine } from "@/lib/conflict-resolver";

const resolver = new ConflictResolutionEngine();

// Simulate concurrent edits
const localEvent = {
  id: "evt-local-1",
  entityId: "tx-test-001",
  entityType: "transaction",
  op: "update",
  lamportClock: 7,
  deviceId: "device-alpha",
  payload: { amount_cents: 150000, description: "Local version" },
  timestamp: Date.now(),
};

const remoteEvent = {
  id: "evt-remote-1",
  entityId: "tx-test-001",
  entityType: "transaction",
  op: "update",
  lamportClock: 5,
  deviceId: "device-beta",
  payload: { amount_cents: 200000, description: "Remote version" },
  timestamp: Date.now() - 2000,
};

const result = await resolver.resolveConflict(localEvent, remoteEvent);

console.log("Winner:", result.winner === localEvent ? "LOCAL" : "REMOTE");
console.log("Strategy:", result.strategy);
console.log("Reason:", result.reason);
console.log("Winning payload:", result.winner.payload);
```

**Expected Output**:

```
Winner: LOCAL
Strategy: record-lww
Reason: Record-level LWW: local has higher lamport clock
Winning payload: { amount_cents: 150000, description: "Local version" }
```

### Test Case 2: DELETE Wins

```javascript
const updateEvent = {
  entityId: "tx-test-002",
  op: "update",
  lamportClock: 10,
  deviceId: "device-alpha",
  payload: { amount_cents: 500000 },
};

const deleteEvent = {
  entityId: "tx-test-002",
  op: "delete",
  lamportClock: 3,
  deviceId: "device-beta",
  payload: {},
};

const result = await resolver.resolveConflict(updateEvent, deleteEvent);

console.log("Winner operation:", result.winner.op);
console.log("Strategy:", result.strategy);
console.log("Loser had higher lamport:", updateEvent.lamportClock > deleteEvent.lamportClock);
```

**Expected Output**:

```
Winner operation: delete
Strategy: delete-wins
Loser had higher lamport: true
```

### Test Case 3: Tie-Breaking with Device ID

```javascript
const event1 = {
  entityId: "tx-test-003",
  op: "update",
  lamportClock: 5,
  deviceId: "device-abc",
  payload: { description: "From ABC" },
};

const event2 = {
  entityId: "tx-test-003",
  op: "update",
  lamportClock: 5,
  deviceId: "device-xyz",
  payload: { description: "From XYZ" },
};

const result = await resolver.resolveConflict(event1, event2);

console.log("Winner device:", result.winner.deviceId);
console.log("Lexicographic comparison:", "device-xyz" > "device-abc");
```

**Expected Output**:

```
Winner device: device-xyz
Lexicographic comparison: true
```

---

## Step 7: Test Resolution Logging (10 min)

**What You're Doing**: Verifying resolutions are persisted to IndexedDB.

```javascript
import { db } from "@/lib/dexie";
import { logConflict } from "@/lib/conflict-detector";
import { conflictResolutionEngine } from "@/lib/conflict-resolver";

// Create and log a conflict
const conflict = await logConflict(localEvent, remoteEvent);
console.log("Conflict created:", conflict.id);

// Resolve it
const resolution = await conflictResolutionEngine.resolveConflict(localEvent, remoteEvent);

// Log resolution
await conflictResolutionEngine.logResolution(conflict, resolution);

// Verify in IndexedDB
const updated = await db.conflicts.get(conflict.id);
console.log("Resolution status:", updated.resolution);
console.log("Resolved at:", updated.resolvedAt);
console.log("Resolved value:", updated.resolvedValue);
```

**Expected Output**:

```
Conflict created: conflict-abc123
Resolution status: resolved
Resolved at: 2025-01-15T10:30:00.000Z
Resolved value: { amount_cents: 150000, description: "Local version" }
```

---

## Step 8: Integration Test with Full Sync Flow (10 min)

**What You're Doing**: Testing end-to-end conflict resolution during sync.

```javascript
import { processSyncBatch } from "@/lib/sync-processor";
import { db } from "@/lib/dexie";

// Create local event
await db.events.add({
  id: "evt-local-sync",
  entityId: "tx-sync-test",
  entityType: "transaction",
  op: "update",
  vectorClock: { "device-A": 5, "device-B": 2 },
  lamportClock: 5,
  payload: { amount_cents: 100000 },
  deviceId: "device-A",
  actorUserId: "user-1",
  timestamp: Date.now(),
  idempotencyKey: "device-A-tx-sync-test-5",
});

// Simulate conflicting remote event
const remoteEvents = [
  {
    id: "evt-remote-sync",
    entityId: "tx-sync-test",
    entityType: "transaction",
    op: "update",
    vectorClock: { "device-A": 3, "device-B": 4 },
    lamportClock: 4,
    payload: { amount_cents: 200000 },
    deviceId: "device-B",
    actorUserId: "user-1",
    timestamp: Date.now() - 1000,
    idempotencyKey: "device-B-tx-sync-test-4",
  },
];

// Process sync (will detect conflict and resolve)
await processSyncBatch(remoteEvents);

// Check results
const conflicts = await db.conflicts.where("entityId").equals("tx-sync-test").toArray();

console.log("Conflicts detected:", conflicts.length);
console.log("Resolution:", conflicts[0]?.resolution);
console.log("Winner:", conflicts[0]?.resolvedValue);
```

**Expected**: Console shows conflict detected and automatically resolved with local version (higher lamport).

---

## Step 9: Test Determinism (5 min)

**What You're Doing**: Verifying resolution is deterministic (same input → same output).

```javascript
const resolver = new ConflictResolutionEngine();

// Run same resolution multiple times
const results = [];
for (let i = 0; i < 5; i++) {
  const result = await resolver.resolveConflict(localEvent, remoteEvent);
  results.push({
    winnerDevice: result.winner.deviceId,
    strategy: result.strategy,
  });
}

// Check all results are identical
const allSame = results.every(
  (r) => r.winnerDevice === results[0].winnerDevice && r.strategy === results[0].strategy
);

console.log("Deterministic:", allSame);
console.log("All results:", results);
```

**Expected**: `Deterministic: true` with all results identical.

---

## Step 10: Test Commutative Property (5 min)

**What You're Doing**: Verifying resolve(A, B) produces same winner as resolve(B, A).

```javascript
// Resolve in both orders
const resultAB = await resolver.resolveConflict(localEvent, remoteEvent);
const resultBA = await resolver.resolveConflict(remoteEvent, localEvent);

// Check winner is same
const sameWinner = resultAB.winner.deviceId === resultBA.winner.deviceId;

console.log("Commutative:", sameWinner);
console.log("Result A→B winner:", resultAB.winner.deviceId);
console.log("Result B→A winner:", resultBA.winner.deviceId);
```

**Expected**: `Commutative: true` with same winner regardless of order.

---

## Done!

When all tests pass and conflicts resolve automatically, proceed to checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Common Patterns

### Pattern 1: Pre-Resolution Hook

```typescript
// Add custom logic before resolution
export async function resolveWithHook(local, remote) {
  // Log for analytics
  console.log("Resolving conflict:", {
    entityId: local.entityId,
    localLamport: local.lamportClock,
    remoteLamport: remote.lamportClock,
  });

  const result = await conflictResolutionEngine.resolveConflict(local, remote);

  // Post-resolution analytics
  trackConflictResolution(result);

  return result;
}
```

### Pattern 2: Resolution Preview

```typescript
// Preview resolution without applying
export function previewResolution(local, remote) {
  const result = conflictResolutionEngine.resolveConflict(local, remote);

  return {
    willWin: result.winner === local ? "local" : "remote",
    strategy: result.strategy,
    losesData: Object.keys(result.loser.payload).filter((key) => !(key in result.winner.payload)),
  };
}
```

### Pattern 3: Batch Resolution

```typescript
// Resolve multiple conflicts efficiently
export async function resolveConflictBatch(conflicts: Conflict[]) {
  const resolutions = await Promise.all(
    conflicts.map(async (conflict) => {
      const result = await conflictResolutionEngine.resolveConflict(
        conflict.localEvent,
        conflict.remoteEvent
      );

      await conflictResolutionEngine.logResolution(conflict, result);

      return result;
    })
  );

  console.log(`Resolved ${resolutions.length} conflicts`);
  return resolutions;
}
```

---

## Notes

**Simplicity**: Record-level LWW keeps code simple (~100 LOC) while handling 95% of conflicts correctly.

**Upgrading to Field-Level**: If you need field-level merge later, the architecture supports it—just add field resolvers without changing the core engine.

**Monitoring**: Track conflict resolution rate to identify patterns or issues:

```typescript
const stats = {
  total: conflicts.length,
  deleteWins: conflicts.filter((c) => c.strategy === "delete-wins").length,
  recordLWW: conflicts.filter((c) => c.strategy === "record-lww").length,
};
```

**Performance**: Resolution is fast (<1ms) so you can resolve conflicts synchronously during sync without impacting UX.
