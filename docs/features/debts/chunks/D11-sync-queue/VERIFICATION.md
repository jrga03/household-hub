# D11 Verification: Sync Queue Integration

## Quick Verification (3 minutes)

```bash
npm run dev
# Create debt while offline (DevTools → Network → Offline)
# Check IndexedDB → syncQueue table for queued item
# Go online, wait 5 seconds, item should be confirmed
```

---

## Part 1: Queue Insertion

### Event Creates Queue Item

```typescript
import { createExternalDebt, getSyncStatus } from "@/lib/debts";
import { db } from "@/lib/dexie";

// Create debt
const debt = await createExternalDebt({
  name: "Test Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Check queue item created
const items = await db.syncQueue.where("entityId").equals(debt.id).toArray();

console.assert(items.length === 1, "Queue item created");
console.assert(items[0].state === "queued", "State is queued");
console.assert(items[0].entityType === "debt", "Entity type correct");
console.assert(items[0].operation === "create", "Operation correct");
```

### Payment Creates Queue Item

```typescript
import { processDebtPayment } from "@/lib/debts";

// Make payment
const result = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// Check queue item
const items = await db.syncQueue.where("entityId").equals(result.payment.id).toArray();

console.assert(items.length === 1, "Payment queue item created");
console.assert(items[0].entityType === "debt_payment", "Type correct");
```

### Idempotency Key Matches

```typescript
// Create debt
const debt = await createExternalDebt({...});

// Get event and queue item
const events = await db.events
  .where('entityId')
  .equals(debt.id)
  .toArray();

const queueItems = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .toArray();

// Verify same idempotency key
console.assert(
  events[0].idempotencyKey === queueItems[0].idempotencyKey,
  'Idempotency keys match'
);
```

---

## Part 2: Sync Status

### getSyncStatus Function

```typescript
import { getSyncStatus } from '@/lib/debts';

// Create debt
const debt = await createExternalDebt({...});

// Check status
const status = await getSyncStatus(debt.id);
console.assert(status === 'queued', 'Status is queued initially');

// Mark as syncing
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();
await db.syncQueue.update(item!.id, { state: 'syncing' });

// Check status again
const status2 = await getSyncStatus(debt.id);
console.assert(status2 === 'syncing', 'Status is syncing');

// Mark as confirmed
await db.syncQueue.update(item!.id, { state: 'confirmed' });

// Check status again
const status3 = await getSyncStatus(debt.id);
console.assert(status3 === 'synced', 'Status is synced');
```

### Status for Failed Sync

```typescript
// Create debt
const debt = await createExternalDebt({...});

// Mark as failed
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();
await db.syncQueue.update(item!.id, {
  state: 'failed',
  error: 'Network error',
});

// Check status
const status = await getSyncStatus(debt.id);
console.assert(status === 'failed', 'Status is failed');
```

---

## Part 3: Sync State Transitions

### Queued → Syncing → Confirmed

```typescript
import { markSyncing, markConfirmed } from '@/lib/debts';

// Create debt
const debt = await createExternalDebt({...});

// Get queue item
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

// Initial state
console.assert(item!.state === 'queued', 'Initial state queued');

// Mark as syncing
await markSyncing(item!.id);
const item2 = await db.syncQueue.get(item!.id);
console.assert(item2!.state === 'syncing', 'Marked as syncing');

// Mark as confirmed
await markConfirmed(item!.id);
const item3 = await db.syncQueue.get(item!.id);
console.assert(item3!.state === 'confirmed', 'Marked as confirmed');
```

### Failed with Retry

```typescript
import { markFailed } from '@/lib/debts';

// Create debt
const debt = await createExternalDebt({...});

// Get queue item
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

// Mark as failed
await markFailed(item!.id, 'Network error');

// Check updated item
const failedItem = await db.syncQueue.get(item!.id);
console.assert(failedItem!.state === 'failed', 'State is failed');
console.assert(failedItem!.attempts === 1, 'Attempts incremented');
console.assert(failedItem!.error === 'Network error', 'Error recorded');
console.assert(failedItem!.nextRetryAt !== undefined, 'Next retry time set');
console.assert(failedItem!.lastAttemptAt !== undefined, 'Last attempt time set');
```

---

## Part 4: Exponential Backoff

### Retry Delays Increase

```typescript
import { markFailed } from '@/lib/debts';

// Create debt
const debt = await createExternalDebt({...});
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

// Record retry times
const retryTimes: number[] = [];

for (let i = 0; i < 7; i++) {
  await markFailed(item!.id, 'Test error');

  const updated = await db.syncQueue.get(item!.id);
  const nextRetry = new Date(updated!.nextRetryAt!);
  const now = new Date();
  const delay = nextRetry.getTime() - now.getTime();

  retryTimes.push(delay);
  console.log(`Attempt ${i + 1}: ${delay}ms`);
}

// Verify increasing delays
// Expected: ~1000, 2000, 5000, 10000, 30000, 60000, 300000
console.assert(retryTimes[0] < retryTimes[1], '1st < 2nd');
console.assert(retryTimes[1] < retryTimes[2], '2nd < 3rd');
console.assert(retryTimes[2] < retryTimes[3], '3rd < 4th');
console.assert(retryTimes[3] < retryTimes[4], '4th < 5th');
console.assert(retryTimes[4] < retryTimes[5], '5th < 6th');

// After max, should stay at 5 minutes
console.assert(retryTimes[6] === retryTimes[5], '6th = 5th (capped)');
```

---

## Part 5: Pending Items Query

### getPendingDebtSyncItems

```typescript
import { getPendingDebtSyncItems } from "@/lib/debts";

// Create multiple debts
const debt1 = await createExternalDebt({
  name: "Debt 1",
  original_amount_cents: 100000,
  household_id: "h1",
});
const debt2 = await createExternalDebt({
  name: "Debt 2",
  original_amount_cents: 200000,
  household_id: "h1",
});
const debt3 = await createExternalDebt({
  name: "Debt 3",
  original_amount_cents: 300000,
  household_id: "h1",
});

// Get pending items
const pending = await getPendingDebtSyncItems();

console.assert(pending.length >= 3, "At least 3 pending items");
console.assert(
  pending.every((item) => item.state === "queued"),
  "All queued"
);
```

### Excludes Items Not Ready to Retry

```typescript
// Create debt and mark as failed with future retry time
const debt = await createExternalDebt({...});
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

// Set next retry to future
await db.syncQueue.update(item!.id, {
  state: 'failed',
  nextRetryAt: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
});

// Get pending items
const pending = await getPendingDebtSyncItems();

// Should not include this item (not ready yet)
console.assert(
  !pending.some(p => p.id === item!.id),
  'Future retry item excluded'
);
```

---

## Part 6: Sync Processor (Manual Testing)

### Process Queue Item

```typescript
import { processSyncQueue } from '@/lib/sync/processor';

// Mock fetch to succeed
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
});

// Create debt
const debt = await createExternalDebt({...});

// Process queue
await processSyncQueue();

// Check item marked as confirmed
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

console.assert(item!.state === 'confirmed', 'Item confirmed');
```

### Handle Network Error

```typescript
// Mock fetch to fail
global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

// Create debt
const debt = await createExternalDebt({...});

// Process queue
await processSyncQueue();

// Check item marked as failed
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

console.assert(item!.state === 'failed', 'Item failed');
console.assert(item!.error === 'Network error', 'Error recorded');
console.assert(item!.attempts === 1, 'Attempts incremented');
```

### Handle Validation Error (Don't Retry)

```typescript
// Mock fetch to return 400 Bad Request
global.fetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 400,
  text: async () => 'Validation error: Invalid amount',
});

// Create debt
const debt = await createExternalDebt({...});

// Process queue
await processSyncQueue();

// Check item marked as failed
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

console.assert(item!.state === 'failed', 'Item failed');
console.assert(item!.error.includes('Client error'), 'Client error recorded');
```

---

## Part 7: Cleanup Old Items

### cleanupOldSyncItems

```typescript
import { cleanupOldSyncItems } from '@/lib/debts';

// Create debt and mark as confirmed
const debt = await createExternalDebt({...});
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

await db.syncQueue.update(item!.id, {
  state: 'confirmed',
  updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
});

// Run cleanup
const cleaned = await cleanupOldSyncItems();

console.assert(cleaned >= 1, 'At least 1 item cleaned');

// Verify item deleted
const deletedItem = await db.syncQueue.get(item!.id);
console.assert(deletedItem === undefined, 'Old item deleted');
```

### Doesn't Delete Recent Items

```typescript
// Create debt (recent)
const debt = await createExternalDebt({...});
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

await db.syncQueue.update(item!.id, { state: 'confirmed' });

// Run cleanup
await cleanupOldSyncItems();

// Verify item still exists
const stillThere = await db.syncQueue.get(item!.id);
console.assert(stillThere !== undefined, 'Recent item not deleted');
```

---

## Part 8: UI Sync Indicators

### Sync Status Displayed

```tsx
// Visual verification in browser
// Create debt while online
// Expected: Brief "syncing" indicator, then green checkmark

// Create debt while offline
// Expected: Amber dot (queued)

// Simulate sync failure (DevTools → Network → Block URL pattern)
// Expected: Red alert icon (failed)
```

### Network Status Indicator

```tsx
// Go offline (DevTools → Network → Offline)
// Expected: Banner appears at bottom-left
// "Offline - changes will sync when online"

// Go online
// Expected: Banner disappears
```

---

## Part 9: Complete Sync Flow

### Offline → Online Flow

```typescript
// 1. Go offline
Object.defineProperty(navigator, "onLine", {
  writable: true,
  value: false,
});

// 2. Create debt
const debt = await createExternalDebt({
  name: "Offline Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

// 3. Verify queued
const status1 = await getSyncStatus(debt.id);
console.assert(status1 === "queued", "Queued while offline");

// 4. Go online
Object.defineProperty(navigator, "onLine", {
  writable: true,
  value: true,
});

// Mock successful sync
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
});

// 5. Process queue
await processSyncQueue();

// 6. Verify synced
const status2 = await getSyncStatus(debt.id);
console.assert(status2 === "synced", "Synced after coming online");
```

### Multiple Operations Flow

```typescript
// Create debt
const debt = await createExternalDebt({
  name: "Multi-Op Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Update name
await updateDebtName(debt.id, "external", "Updated Name");

// Make payment
await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// Get all queue items for this debt
const debtItems = await db.syncQueue.where("entityId").equals(debt.id).toArray();

// Should have 2 items (create + update)
console.assert(debtItems.length === 2, "Two debt operations queued");

// Get payment queue items
const paymentItems = await db.syncQueue.where("entityType").equals("debt_payment").toArray();

// Should have 1 item (payment create)
console.assert(paymentItems.length >= 1, "Payment operation queued");

// Process all
await processSyncQueue();

// Verify all confirmed
const allItems = [...debtItems, ...paymentItems];
for (const item of allItems) {
  const updated = await db.syncQueue.get(item.id);
  console.assert(updated!.state === "confirmed", `Item ${item.id} confirmed`);
}
```

---

## Part 10: IndexedDB Inspection

### Browser DevTools Verification

```bash
# Open Chrome DevTools → Application → IndexedDB → household-hub → syncQueue

# Verify queue item structure:
{
  id: "sq-...",
  entityType: "debt",
  entityId: "debt-...",
  eventId: "evt-...",
  operation: "create",
  payload: { name: "...", original_amount_cents: 100000, ... },
  idempotencyKey: "device-...-debt-...-42",
  state: "queued",
  attempts: 0,
  deviceId: "device-...",
  userId: "user-1",
  created_at: "2025-11-10T10:00:00.000Z",
  updated_at: "2025-11-10T10:00:00.000Z"
}
```

### Queue Count Check

```typescript
// Create known number of operations
const debt1 = await createExternalDebt({...});
const debt2 = await createExternalDebt({...});
await updateDebtName(debt1.id, 'external', 'New');

// Count queue items
const allItems = await db.syncQueue.toArray();
const debtItems = allItems.filter(item =>
  item.entityType === 'debt' || item.entityType === 'internal_debt'
);

// Expected: 2 creates + 1 update = 3
console.assert(debtItems.length === 3, 'Expected queue count');
```

---

## Edge Cases

### Edge Case 1: Rapid Operations

```typescript
// Create debt and immediately update multiple times
const debt = await createExternalDebt({...});
await updateDebtName(debt.id, 'external', 'Name 1');
await updateDebtName(debt.id, 'external', 'Name 2');
await updateDebtName(debt.id, 'external', 'Name 3');

// Get queue items
const items = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .toArray();

// Should have 4 items (create + 3 updates)
console.assert(items.length === 4, 'All rapid updates queued');
```

### Edge Case 2: Max Retry Attempts

```typescript
// Create debt
const debt = await createExternalDebt({...});
const item = await db.syncQueue
  .where('entityId')
  .equals(debt.id)
  .first();

// Mark as failed 10 times
for (let i = 0; i < 10; i++) {
  await markFailed(item!.id, 'Test error');
}

// Check attempts
const failedItem = await db.syncQueue.get(item!.id);
console.assert(failedItem!.attempts === 10, 'Max attempts reached');

// Next retry should still be calculated
console.assert(failedItem!.nextRetryAt !== undefined, 'Next retry time set');
```

### Edge Case 3: Queue While Offline, Multiple Items

```typescript
// Go offline
Object.defineProperty(navigator, "onLine", {
  writable: true,
  value: false,
});

// Create multiple operations
const debt1 = await createExternalDebt({
  name: "Debt 1",
  original_amount_cents: 100000,
  household_id: "h1",
});
const debt2 = await createExternalDebt({
  name: "Debt 2",
  original_amount_cents: 200000,
  household_id: "h1",
});
await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  debt_id: debt1.id,
  payment_date: "2025-11-10",
  household_id: "h1",
});

// Get pending items
const pending = await getPendingDebtSyncItems();

// Should have 3 items
console.assert(pending.length === 3, "All offline operations queued");

// Go online
Object.defineProperty(navigator, "onLine", {
  writable: true,
  value: true,
});

// Mock successful sync
global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

// Process all
await processSyncQueue();

// Verify all synced
for (const item of pending) {
  const synced = await db.syncQueue.get(item.id);
  console.assert(synced!.state === "confirmed", `Item ${item.id} synced`);
}
```

---

## Final Checklist

- [ ] Event creation adds to sync queue
- [ ] Queue item has correct structure
- [ ] Idempotency key matches event
- [ ] getSyncStatus returns correct state
- [ ] State transitions follow state machine
- [ ] markSyncing updates state
- [ ] markConfirmed updates state
- [ ] markFailed increments attempts and sets retry time
- [ ] Exponential backoff delays increase
- [ ] getPendingDebtSyncItems returns queued/failed items
- [ ] Excludes items not ready to retry
- [ ] Sync processor marks as syncing before request
- [ ] Successful sync marks as confirmed
- [ ] Network error marks as failed with retry
- [ ] Validation error marks as failed without retry
- [ ] cleanupOldSyncItems deletes old confirmed items
- [ ] Doesn't delete recent items
- [ ] Sync status indicators visible in UI
- [ ] Network status indicator shows offline state
- [ ] Complete offline → online flow works
- [ ] Multiple operations sync correctly

**Status**: ✅ Chunk D11 Complete

**Next Chunk**: D12 - Testing & Edge Cases

---

## Performance Verification

### Queue Performance with Many Items

```typescript
// Create 100 operations
const debts = await Promise.all(
  Array.from({ length: 100 }, (_, i) =>
    createExternalDebt({
      name: `Debt ${i}`,
      original_amount_cents: 100000,
      household_id: "h1",
    })
  )
);

// Measure query time
const start = Date.now();
const pending = await getPendingDebtSyncItems();
const duration = Date.now() - start;

console.log(`Query time for 100 items: ${duration}ms`);
console.assert(duration < 100, "Query under 100ms");
console.assert(pending.length === 100, "All items returned");
```

### Sync Performance

```typescript
// Mock fast server
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
});

// Create 50 operations
for (let i = 0; i < 50; i++) {
  await createExternalDebt({
    name: `Perf Debt ${i}`,
    original_amount_cents: 100000,
    household_id: "h1",
  });
}

// Measure sync time
const start = Date.now();
await processSyncQueue();
const duration = Date.now() - start;

console.log(`Sync time for 50 items: ${duration}ms`);
console.assert(duration < 5000, "Sync under 5 seconds");
```
