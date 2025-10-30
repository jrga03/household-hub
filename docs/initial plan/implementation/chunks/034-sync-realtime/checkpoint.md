# Checkpoint: Sync Realtime

Run these verifications to ensure everything works correctly.

---

## 1. Realtime Subscriptions Active ✓

### Test 1.1: Check Supabase Dashboard

1. Open Supabase Dashboard → Database → Realtime
2. Verify realtime is enabled for:
   - `transactions` table
   - `accounts` table
   - `categories` table
   - `budgets` table

**Expected**: Green checkmarks for all tables

### Test 1.2: Verify Subscriptions in Code

```javascript
import { supabase } from "@/lib/supabase";

// Check active channels
const channels = supabase.getChannels();
console.log("Active channels:", channels.length);
console.log(
  "Channel names:",
  channels.map((c) => c.topic)
);
```

**Expected Output**:

```
Active channels: 4
Channel names: ['transactions-changes', 'accounts-changes', 'categories-changes', 'budgets-changes']
```

### Test 1.3: Check Subscription Status

```javascript
import { realtimeSync } from "@/lib/realtime-sync";

// Subscription status should be tracked
console.log("Initialized:", realtimeSync.isInitialized);
```

**Expected**: `true`

---

## 2. Changes Propagate Across Tabs ✓

### Test 2.1: INSERT Propagation

1. Open app in two browser tabs (Tab A and Tab B)
2. In Tab A: Create a new transaction
   ```javascript
   await db.transactions.add({
     id: "tx-test-001",
     amount_cents: 100000,
     description: "Test transaction",
     date: new Date().toISOString().split("T")[0],
     type: "expense",
     household_id: "household-1",
     account_id: "account-1",
     category_id: "category-1",
   });
   ```
3. Watch Tab B console

**Expected**:

- Tab B console shows: `"Change on transactions: INSERT"`
- Tab B IndexedDB contains new transaction within 2 seconds
- Tab B UI updates automatically

### Test 2.2: UPDATE Propagation

1. In Tab A: Update existing transaction
   ```javascript
   await db.transactions.update("tx-test-001", {
     amount_cents: 200000,
     description: "Updated transaction",
   });
   ```
2. Watch Tab B

**Expected**:

- Tab B console shows: `"Change on transactions: UPDATE"`
- Tab B shows updated values within 2 seconds

### Test 2.3: DELETE Propagation

1. In Tab A: Delete transaction
   ```javascript
   await db.transactions.delete("tx-test-001");
   ```
2. Watch Tab B

**Expected**:

- Tab B console shows: `"Change on transactions: DELETE"`
- Transaction removed from Tab B IndexedDB and UI

---

## 3. Multi-Table Sync Works ✓

### Test 3.1: Accounts Sync

```javascript
// Tab A: Create account
await db.accounts.add({
  id: "acc-test-001",
  name: "Test Account",
  account_type: "checking",
  household_id: "household-1",
});

// Tab B: Check if received
setTimeout(async () => {
  const account = await db.accounts.get("acc-test-001");
  console.log("Account synced:", account !== undefined);
}, 2000);
```

**Expected**: `Account synced: true`

### Test 3.2: Categories Sync

```javascript
// Tab A: Create category
await db.categories.add({
  id: "cat-test-001",
  name: "Test Category",
  household_id: "household-1",
});

// Tab B: Verify
setTimeout(async () => {
  const category = await db.categories.get("cat-test-001");
  console.log("Category synced:", category !== undefined);
}, 2000);
```

**Expected**: `Category synced: true`

---

## 4. Conflict Resolution Integration ✓

### Test 4.1: Concurrent Edits Resolved

```javascript
// Setup: Create transaction in both tabs
const transactionData = {
  id: "tx-conflict-001",
  amount_cents: 100000,
  description: "Original",
  date: new Date().toISOString().split("T")[0],
  type: "expense",
  household_id: "household-1",
  account_id: "account-1",
  category_id: "category-1",
};

// Tab A and Tab B: Both add same transaction
await db.transactions.add(transactionData);

// Tab A: Update to ₱1,500
await db.transactions.update("tx-conflict-001", {
  amount_cents: 150000,
  description: "From Tab A",
});

// Tab B: Update to ₱2,000 (at roughly the same time)
await db.transactions.update("tx-conflict-001", {
  amount_cents: 200000,
  description: "From Tab B",
});

// Wait for sync and resolution
setTimeout(async () => {
  const resultA = await db.transactions.get("tx-conflict-001");
  const resultB = await db.transactions.get("tx-conflict-001");

  console.log("Tab A amount:", resultA.amount_cents);
  console.log("Tab B amount:", resultB.amount_cents);
  console.log("Converged:", resultA.amount_cents === resultB.amount_cents);
}, 5000);
```

**Expected**:

- Both tabs converge to same value
- Winner determined by lamport clock
- `Converged: true`

---

## 5. Sync Indicator Works ✓

### Test 5.1: Online Status

1. Check sync indicator in UI
2. **Expected**: Shows green WiFi icon with "Connected" text

### Test 5.2: Offline Detection

1. Open DevTools → Network → Set to "Offline"
2. **Expected**: Sync indicator changes to red WifiOff icon with "Offline" text

### Test 5.3: Reconnection

1. Re-enable network
2. **Expected**:
   - Indicator briefly shows spinning icon with "Syncing..."
   - Then returns to green WiFi with "Connected"
   - Any queued changes uploaded

### Test 5.4: Tooltip Shows Details

1. Hover over sync indicator
2. **Expected**: Tooltip shows:
   ```
   Connected
   Last sync: 5s ago
   0 pending changes
   ```

---

## 6. Connection Status Store Updates ✓

### Test 6.1: Status Tracking

```javascript
import { useSyncStore } from "@/stores/syncStore";

// Check current status
const status = useSyncStore.getState().status;
console.log("Status:", status); // "online", "offline", "syncing", or "error"

// Check last sync time
const lastSync = useSyncStore.getState().lastSyncTime;
console.log("Last sync:", lastSync);

// Check pending changes
const pending = useSyncStore.getState().pendingChanges;
console.log("Pending:", pending);
```

**Expected**: Status reflects actual connection state

### Test 6.2: Status Updates on Events

```javascript
// Subscribe to status changes
useSyncStore.subscribe((state) => {
  console.log("Status changed to:", state.status);
});

// Trigger offline
window.dispatchEvent(new Event("offline"));
// Expected: "Status changed to: offline"

// Trigger online
window.dispatchEvent(new Event("online"));
// Expected: "Status changed to: online"
```

---

## 7. Reconnection Catch-Up Works ✓

### Test 7.1: Offline Edits Sync on Reconnection

```javascript
// Step 1: Go offline
window.dispatchEvent(new Event("offline"));

// Step 2: Create transaction while offline
await db.transactions.add({
  id: "tx-offline-001",
  amount_cents: 50000,
  description: "Created offline",
  date: new Date().toISOString().split("T")[0],
  type: "expense",
  household_id: "household-1",
  account_id: "account-1",
  category_id: "category-1",
});

// Step 3: Add to sync queue
await db.sync_queue.add({
  id: "queue-1",
  operation: "create",
  table: "transactions",
  record_id: "tx-offline-001",
  payload: {
    /* transaction data */
  },
  created_at: new Date(),
});

// Step 4: Go back online
window.dispatchEvent(new Event("online"));

// Step 5: Verify queue processed
setTimeout(async () => {
  const remaining = await db.sync_queue.count();
  console.log("Remaining in queue:", remaining);
  // Expected: 0
}, 3000);
```

**Expected**: Queue emptied, transaction synced to server

### Test 7.2: Fetch Missed Changes on Reconnection

```javascript
// Simulate: Another device made changes while this device was offline
// When reconnecting, those changes should be fetched

// Check fetchLatestChanges was called
console.log("Last sync time updated:", useSyncStore.getState().lastSyncTime);
// Expected: Recent timestamp
```

---

## 8. Performance Check ✓

### Test 8.1: Propagation Latency

```javascript
// Measure time from change to propagation
const start = Date.now();

// Tab A: Create transaction
await db.transactions.add({
  id: "tx-latency-test",
  // ... fields
});

// Tab B: Set up listener
const subscription = db.transactions.hook("creating", function () {
  const latency = Date.now() - start;
  console.log(`Latency: ${latency}ms`);
});

// Expected: <500ms typically, <2000ms worst case
```

### Test 8.2: High-Frequency Updates

```javascript
// Test rapid updates don't overwhelm system
console.time("batch-sync");

for (let i = 0; i < 50; i++) {
  await db.transactions.add({
    id: `tx-batch-${i}`,
    amount_cents: i * 1000,
    // ... other fields
  });
}

console.timeEnd("batch-sync");
// Expected: Completes without errors, <5 seconds for 50 transactions
```

---

## 9. Error Handling ✓

### Test 9.1: Subscription Error Recovery

```javascript
// Simulate subscription error
const channel = supabase.getChannels()[0];
channel.push("error", { message: "Test error" });

// Check status
setTimeout(() => {
  const status = useSyncStore.getState().status;
  console.log("Status after error:", status);
  // Expected: "error" or auto-recovered to "online"
}, 2000);
```

### Test 9.2: Network Interruption

1. Disable network mid-sync
2. **Expected**: No crashes, status updates to "offline"
3. Re-enable network
4. **Expected**: Auto-reconnects, processes queue

---

## 10. Browser Compatibility ✓

### Test 10.1: WebSocket Support

```javascript
console.log("WebSocket supported:", "WebSocket" in window);
// Expected: true in all modern browsers
```

### Test 10.2: iOS Safari Background Tab Handling

(Manual test on iOS device)

1. Open app in Safari
2. Create transaction
3. Switch to another app (background)
4. Wait 1 minute
5. Return to app
6. **Expected**: Reconnects automatically, fetches missed changes

---

## 11. Data Integrity ✓

### Test 11.1: No Duplicate Inserts

```javascript
// Same record inserted twice should be caught
await db.transactions.add({ id: "tx-dup-001" /* ... */ });
await db.transactions.add({ id: "tx-dup-001" /* ... */ }); // Should not duplicate

const count = await db.transactions.where("id").equals("tx-dup-001").count();
console.log("Count:", count);
// Expected: 1 (not 2)
```

### Test 11.2: Update Ordering

```javascript
// Rapid updates should apply in correct order
await db.transactions.update("tx-order-001", { amount_cents: 100000 });
await db.transactions.update("tx-order-001", { amount_cents: 200000 });
await db.transactions.update("tx-order-001", { amount_cents: 300000 });

setTimeout(async () => {
  const final = await db.transactions.get("tx-order-001");
  console.log("Final amount:", final.amount_cents);
  // Expected: 300000 (last update wins)
}, 2000);
```

---

## Success Criteria

All checkpoints must pass:

- [ ] Realtime subscriptions active for all tables
- [ ] Changes propagate across tabs/devices (<2s latency)
- [ ] Multi-table sync works (transactions, accounts, categories, budgets)
- [ ] Conflicts detected and resolved automatically
- [ ] Sync indicator shows correct status
- [ ] Connection status store updates reactively
- [ ] Reconnection catch-up works (processes queue, fetches missed changes)
- [ ] Performance acceptable (<500ms propagation, handles 50+ rapid updates)
- [ ] Error handling graceful (no crashes on network interruption)
- [ ] Data integrity maintained (no duplicates, correct ordering)

---

## Common Issues

### Issue: Subscriptions not connecting

**Solution**: Check Supabase realtime enabled in dashboard Settings → API → Realtime

### Issue: RLS blocking realtime events

**Solution**: Ensure SELECT policy allows user to view records:

```sql
CREATE POLICY "Allow realtime SELECT" ON transactions
FOR SELECT USING (true);  -- Or appropriate condition
```

### Issue: Changes don't propagate

**Solution**: Verify channel names match table names exactly

### Issue: Excessive memory usage

**Solution**: Limit subscription scope with filters

---

## Cleanup After Testing

```javascript
// Clear test transactions
await db.transactions.where("id").startsWith("tx-test-").delete();

await db.transactions.where("id").startsWith("tx-conflict-").delete();

// Clear sync queue
await db.sync_queue.clear();

console.log("Test data cleaned up");
```

---

## Next Steps

Once all checkpoints pass:

1. Clean up test data
2. Commit realtime sync code
3. Move to **Chunk 035: Event Compaction**

---

**Estimated Time**: 30-40 minutes to verify all checkpoints
