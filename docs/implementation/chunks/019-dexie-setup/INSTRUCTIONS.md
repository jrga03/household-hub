# Instructions: Dexie Setup

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Install Dependencies (5 min)

```bash
npm install dexie dexie-react-hooks
npm install @fingerprintjs/fingerprintjs
```

**Verify**: Check package.json includes dexie, dexie-react-hooks, and @fingerprintjs/fingerprintjs

---

## Step 2: Create Dexie Database Class (20 min)

Create `src/lib/dexie/db.ts`:

```typescript
import Dexie, { Table } from "dexie";

export interface LocalTransaction {
  id: string;
  household_id: string;
  date: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id?: string;
  category_id?: string;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  created_by_user_id: string;
  tagged_user_ids: string[];
  transfer_group_id?: string;
  notes?: string;
  device_id: string;
  created_at: string;
  updated_at: string;
}

export interface LocalAccount {
  id: string;
  household_id: string;
  name: string;
  type: string;
  initial_balance_cents: number;
  currency_code: string;
  visibility: string;
  owner_user_id?: string;
  color: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalCategory {
  id: string;
  household_id: string;
  parent_id?: string;
  name: string;
  color: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  household_id: string;
  entity_type: string;
  entity_id: string;
  operation: any;
  device_id: string;
  status: "queued" | "syncing" | "completed" | "failed";
  retry_count: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  op: "create" | "update" | "delete";
  payload: any;
  lamport_clock: number;
  vector_clock: any;
  device_id: string;
  actor_user_id: string;
  timestamp: string;
}

export interface MetaEntry {
  key: string;
  value: any;
}

export class HouseholdHubDB extends Dexie {
  transactions!: Table<LocalTransaction, string>;
  accounts!: Table<LocalAccount, string>;
  categories!: Table<LocalCategory, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  events!: Table<TransactionEvent, string>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super("HouseholdHubDB");

    // Version 1: Initial schema
    this.version(1).stores({
      transactions: "id, date, account_id, category_id, status, type, household_id, created_at",
      accounts: "id, name, visibility, household_id",
      categories: "id, parent_id, name, household_id",
      syncQueue: "id, status, entity_type, entity_id, device_id, created_at",
      events: "id, entity_id, lamport_clock, timestamp, device_id",
      meta: "key",
    });

    // Version 2: Add tagged_user_ids support (future migration example)
    // this.version(2).stores({
    //   transactions: 'id, date, account_id, category_id, status, type, household_id, created_at, *tagged_user_ids',
    // }).upgrade(tx => {
    //   return tx.table('transactions').toCollection().modify(txn => {
    //     if (!txn.tagged_user_ids) {
    //       txn.tagged_user_ids = [];
    //     }
    //   });
    // });
  }
}

// Export singleton instance
export const db = new HouseholdHubDB();

// Open database on import
db.open().catch((err) => {
  console.error("Failed to open database:", err);
});
```

---

## Step 3: Create Device Manager (20 min)

Create `src/lib/dexie/deviceManager.ts`:

```typescript
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { db } from "./db";
import { nanoid } from "nanoid";

class DeviceManager {
  private deviceId: string | null = null;
  private fpPromise: Promise<any> | null = null;

  async getDeviceId(): Promise<string> {
    // Return cached if available
    if (this.deviceId) return this.deviceId;

    // Priority 1: Check IndexedDB
    try {
      const stored = await db.meta.get("deviceId");
      if (stored?.value) {
        this.deviceId = stored.value;
        // Also update localStorage for redundancy
        localStorage.setItem("deviceId", this.deviceId);
        return this.deviceId;
      }
    } catch (error) {
      console.warn("IndexedDB device ID lookup failed:", error);
    }

    // Priority 2: Check localStorage (backup)
    const localStorageId = localStorage.getItem("deviceId");
    if (localStorageId) {
      this.deviceId = localStorageId;
      // Store in IndexedDB for next time
      await this.storeDeviceId(this.deviceId);
      return this.deviceId;
    }

    // Priority 3: Use FingerprintJS (survives cache clearing)
    try {
      if (!this.fpPromise) {
        this.fpPromise = FingerprintJS.load();
      }
      const fp = await this.fpPromise;
      const result = await fp.get();

      // Use visitor ID as device identifier
      this.deviceId = result.visitorId;

      // Store in both places for redundancy
      await this.storeDeviceId(this.deviceId);

      console.log("Device ID generated from fingerprint:", this.deviceId);
      return this.deviceId;
    } catch (error) {
      console.error("Fingerprinting failed, generating UUID:", error);

      // Final fallback: Generate new UUID
      this.deviceId = nanoid();
      await this.storeDeviceId(this.deviceId);
      return this.deviceId;
    }
  }

  private async storeDeviceId(deviceId: string): Promise<void> {
    // Store in both IndexedDB and localStorage for redundancy
    try {
      await db.meta.put({ key: "deviceId", value: deviceId });
    } catch (error) {
      console.warn("Failed to store device ID in IndexedDB:", error);
    }

    localStorage.setItem("deviceId", deviceId);
  }

  async clearDeviceId(): Promise<void> {
    this.deviceId = null;
    await db.meta.delete("deviceId");
    localStorage.removeItem("deviceId");
  }
}

// Export singleton instance
export const deviceManager = new DeviceManager();
```

---

## Step 4: Test IndexedDB Operations (10 min)

Create test file `src/lib/dexie/db.test.ts` or test in browser console:

```typescript
import { db } from "./db";
import { deviceManager } from "./deviceManager";

// Test 1: Device ID persistence
async function testDeviceId() {
  const deviceId = await deviceManager.getDeviceId();
  console.log("Device ID:", deviceId);

  // Should return same ID on second call
  const deviceId2 = await deviceManager.getDeviceId();
  console.assert(deviceId === deviceId2, "Device ID should be consistent");
}

// Test 2: Store and retrieve transaction
async function testTransaction() {
  const testTx = {
    id: "test-tx-1",
    household_id: "00000000-0000-0000-0000-000000000001",
    date: new Date().toISOString().split("T")[0],
    description: "Test transaction",
    amount_cents: 10000,
    type: "expense" as const,
    status: "pending" as const,
    visibility: "household" as const,
    created_by_user_id: "test-user",
    tagged_user_ids: [],
    device_id: await deviceManager.getDeviceId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Add
  await db.transactions.add(testTx);
  console.log("Added transaction");

  // Retrieve
  const retrieved = await db.transactions.get("test-tx-1");
  console.assert(retrieved?.id === "test-tx-1", "Should retrieve transaction");

  // Clean up
  await db.transactions.delete("test-tx-1");
  console.log("Test passed!");
}

// Run tests
await testDeviceId();
await testTransaction();
```

---

## Step 5: Create Offline Types (5 min)

Create `src/lib/types/offline.ts`:

```typescript
export interface OfflineStatus {
  isOnline: boolean;
  lastSync?: Date;
  pendingChanges: number;
  storageUsed: number;
  storageQuota: number;
}

export interface SyncStatus {
  status: "idle" | "syncing" | "error";
  message?: string;
  progress?: {
    current: number;
    total: number;
  };
}
```

---

## Done!

When tests pass, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify IndexedDB works correctly.
