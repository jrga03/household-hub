# Checkpoint: Dexie Setup

---

## 1. Dexie Database Opens ✓

Open browser console and run:

```javascript
await db.open();
console.log("Database open");
```

**Expected**: No errors, database opens successfully

---

## 2. Tables Exist ✓

```javascript
console.log(
  "Tables:",
  db.tables.map((t) => t.name)
);
```

**Expected**:

```
['transactions', 'accounts', 'categories', 'syncQueue', 'events', 'meta', 'logs']
```

---

## 3. Can Store and Retrieve Data ✓

```javascript
// Add test transaction
await db.transactions.add({
  id: "test-1",
  household_id: "00000000-0000-0000-0000-000000000001",
  date: "2024-01-15",
  description: "Test",
  amount_cents: 10000,
  type: "expense",
  status: "pending",
  visibility: "household",
  created_by_user_id: "user-1",
  tagged_user_ids: [],
  device_id: "device-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Retrieve
const tx = await db.transactions.get("test-1");
console.log("Retrieved:", tx);

// Clean up
await db.transactions.delete("test-1");
```

**Expected**: Transaction stored and retrieved correctly

---

## 4. Device ID Persists ✓

```javascript
import { deviceManager } from "@/lib/dexie/deviceManager";

const id1 = await deviceManager.getDeviceId();
console.log("First call:", id1);

const id2 = await deviceManager.getDeviceId();
console.log("Second call:", id2);

console.assert(id1 === id2, "Device IDs should match");
```

**Expected**: Same device ID returned both times

---

## 5. Device ID in Both Storages ✓

```javascript
// Check IndexedDB
const stored = await db.meta.get("deviceId");
console.log("IndexedDB:", stored?.value);

// Check localStorage
const local = localStorage.getItem("deviceId");
console.log("localStorage:", local);

console.assert(stored?.value === local, "Should be in both storages");
```

**Expected**: Device ID exists in both places

---

## 6. IndexedDB Persists Across Refreshes ✓

**Steps**:

1. Store test data
2. Refresh page (F5)
3. Check data still exists

**Expected**: Data persists after refresh

---

## 7. Query with Indexes ✓

```javascript
// Add some test data
await db.transactions.bulkAdd([
  { id: "1", date: "2024-01-01", type: "expense" /* ... */ },
  { id: "2", date: "2024-01-02", type: "income" /* ... */ },
  { id: "3", date: "2024-01-03", type: "expense" /* ... */ },
]);

// Query by type (uses index)
const expenses = await db.transactions.where("type").equals("expense").toArray();
console.log("Expenses:", expenses.length);

// Query by date (uses index)
const jan = await db.transactions.where("date").between("2024-01-01", "2024-01-31").toArray();
console.log("January:", jan.length);

// Clean up
await db.transactions.clear();
```

**Expected**: Queries return correct results

---

## 8. Storage Quota Check ✓

```javascript
if (navigator.storage && navigator.storage.estimate) {
  const estimate = await navigator.storage.estimate();
  console.log("Usage:", estimate.usage);
  console.log("Quota:", estimate.quota);
  console.log("Percentage:", ((estimate.usage / estimate.quota) * 100).toFixed(2) + "%");
}
```

**Expected**: Shows storage usage < 1% initially

---

## 9. Device Registration Works ✓

```javascript
import { deviceManager } from "@/lib/dexie/deviceManager";
import { supabase } from "@/lib/supabase";

// Get device ID
const deviceId = await deviceManager.getDeviceId();
console.log("Device ID:", deviceId);

// Check device registration in Supabase (requires auth)
const { data: device } = await supabase.from("devices").select("*").eq("id", deviceId).single();

console.log("Registered device:", device);
console.log("Device name:", device?.name); // e.g., "Chrome on macOS"
console.log("Platform:", device?.platform); // e.g., "web" or "pwa-ios"
```

**Expected**:

- Device ID returned consistently
- Device registered in `devices` table with name and platform
- `last_seen` timestamp updates on subsequent calls

---

## Success Criteria

- [ ] Database opens without errors
- [ ] All 7 tables created (including logs)
- [ ] Can add/retrieve data
- [ ] Device ID persists across reloads
- [ ] Device ID in both IndexedDB and localStorage
- [ ] Device registration creates entry in Supabase devices table
- [ ] Device name and platform detected correctly
- [ ] Data persists after page refresh
- [ ] Index queries work efficiently
- [ ] Storage quota accessible

---

**Next**: Move to Chunk 020 (Offline Reads)
