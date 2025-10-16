# Checkpoint: Offline Reads

---

## 1. Online Status Detection Works ✓

Open browser console and run:

```javascript
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// Should return true when online
console.log("Online status:", useOnlineStatus());

// Toggle network in DevTools (Network tab → Throttling → Offline)
// Wait a few seconds, check again - should return false
```

**Expected**: Returns true when online, false when offline

---

## 2. IndexedDB Reads Return Data Instantly ✓

```javascript
import { db } from "@/lib/dexie/db";

// Add some test data first
await db.transactions.add({
  id: "test-offline-1",
  household_id: "00000000-0000-0000-0000-000000000001",
  date: "2024-01-15",
  description: "Offline test",
  amount_cents: 5000,
  type: "expense",
  status: "pending",
  visibility: "household",
  created_by_user_id: "user-1",
  tagged_user_ids: [],
  device_id: "device-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Now test offline read
const start = performance.now();
const transactions = await db.transactions.toArray();
const duration = performance.now() - start;

console.log("Read time:", duration, "ms");
console.log("Transaction count:", transactions.length);

// Clean up
await db.transactions.delete("test-offline-1");
```

**Expected**: Read time < 10ms, returns all transactions

---

## 3. Offline Hook Returns Cached Data ✓

Test in React component:

```typescript
import { useOfflineTransactions } from '@/hooks/useOfflineTransactions';

function TestComponent() {
  const { data, isLoading, isOnline } = useOfflineTransactions();

  console.log('Is online:', isOnline);
  console.log('Is loading:', isLoading);
  console.log('Transaction count:', data.length);

  return <div>Check console</div>;
}
```

**Expected**:

- `isLoading: false` (IndexedDB is instant)
- `isOnline: true` (if connected)
- `data` returns transactions immediately

---

## 4. Background Sync Updates Cache ✓

```javascript
// 1. Set network to "Online"
// 2. Open Network tab to see requests
// 3. Trigger background sync:

import { useOfflineTransactions } from "@/hooks/useOfflineTransactions";

const { isSyncing } = useOfflineTransactions();
console.log("Is syncing:", isSyncing);

// 4. Should see Supabase request in Network tab
// 5. After sync completes, check IndexedDB was updated:

const cached = await db.transactions.toArray();
console.log("Cached transactions:", cached.length);
```

**Expected**:

- Network request to Supabase visible
- IndexedDB updated with fresh data
- `isSyncing: true` while fetching, then `false`

---

## 5. Offline Banner Appears When Disconnected ✓

**Steps**:

1. Open app with network online
2. Banner should NOT be visible
3. Set network to "Offline" in DevTools
4. Banner appears at top with yellow background
5. Click "Retry" button
6. Set network back to "Online"
7. Banner disappears

**Expected**: Banner shows/hides correctly based on connection

---

## 6. Sync Status Shows Last Sync Time ✓

```javascript
import { cacheManager } from "@/lib/offline/cacheManager";

// Check last sync timestamp
const lastSync = await cacheManager.getLastSync();
console.log("Last sync:", lastSync);

// Should show relative time (e.g., "Synced 2 minutes ago")
```

**Expected**:

- Shows "Never synced" if no sync yet
- Shows relative time after first sync
- Updates every minute

---

## 7. Pending Count Shows Queued Changes ✓

```javascript
import { db } from "@/lib/dexie/db";
import { cacheManager } from "@/lib/offline/cacheManager";

// Add item to sync queue
await db.syncQueue.add({
  id: "test-sync-1",
  household_id: "00000000-0000-0000-0000-000000000001",
  entity_type: "transaction",
  entity_id: "tx-1",
  operation: { type: "create", payload: {} },
  device_id: "device-1",
  status: "queued",
  retry_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Check pending count
const count = await cacheManager.getPendingCount();
console.log("Pending count:", count);

// Clean up
await db.syncQueue.delete("test-sync-1");
```

**Expected**: Count shows number of queued/syncing items

---

## 8. Offline Reads Work Without Network ✓

**Steps**:

1. Ensure some data exists in IndexedDB
2. Set network to "Offline"
3. Navigate to transactions page
4. Data should appear instantly from IndexedDB
5. No loading spinner
6. No error messages

**Expected**: App fully functional offline for reads

---

## 9. Reconnect Triggers Background Sync ✓

**Steps**:

1. Start offline
2. Navigate to transactions page (shows cached data)
3. Set network back to "Online"
4. Wait a few seconds
5. Check Network tab for Supabase request
6. Verify sync status shows "Syncing..."
7. After complete, shows "Synced X seconds ago"

**Expected**: Automatic sync when reconnected

---

## 10. Cache Persists Across Page Refresh ✓

**Steps**:

1. Load transactions page (populates IndexedDB)
2. Check sync status shows successful sync
3. Refresh page (F5)
4. Set network to "Offline" before page loads
5. Data still appears instantly from cache

**Expected**: Offline reads work immediately after refresh

---

## Success Criteria

- [ ] Online/offline detection accurate
- [ ] IndexedDB reads < 10ms
- [ ] Offline hook returns data instantly
- [ ] Background sync updates cache when online
- [ ] Offline banner appears/disappears correctly
- [ ] Sync status shows last sync time
- [ ] Pending count accurate
- [ ] App works fully offline for reads
- [ ] Reconnect triggers automatic sync
- [ ] Cache persists across refreshes

---

**Next**: Move to Chunk 021 (Offline Writes)
