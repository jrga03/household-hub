# D2 Implementation: Dexie Schema & Offline Setup

## Overview

You'll modify the existing Dexie database schema to add debt tracking tables and create TypeScript type definitions. This enables offline-first debt operations with type safety.

**Estimated time**: 1 hour

---

## Step 1: Determine Current Schema Version

### 1.1 Check Existing Dexie Version

Open `src/lib/dexie/db.ts` and find the current version:

```typescript
// Look for existing version definitions like:
db.version(1).stores({ ... });
db.version(2).stores({ ... });
db.version(3).stores({ ... });
```

**Identify the highest version number** (e.g., if you see versions 1, 2, 3, the current version is 3).

### 1.2 Set Debt Migration Version

**CRITICAL**: Set the next version number explicitly. Do NOT use `db.verno + 1`.

```typescript
// At the top of your migration section
const DEBT_MIGRATION_VERSION = 4; // Replace 4 with current + 1
```

**Example**:

- Current highest version: 3
- Set `DEBT_MIGRATION_VERSION = 4`

**Why**: Dynamic version calculation creates infinite version loops. See README.md Design Patterns for details.

---

## Step 2: Create TypeScript Interfaces

Create new file: `src/types/debt.ts`

```typescript
// src/types/debt.ts
/**
 * Debt Tracking Type Definitions
 *
 * Architecture:
 * - Balances are DERIVED from payment history (never stored)
 * - Payments are IMMUTABLE (compensating events for edits)
 * - Internal debts use SOFT REFERENCES (no FK constraints)
 */

// =====================================================
// Base Types
// =====================================================

export type DebtStatus = "active" | "paid_off" | "archived";

export type EntityType = "category" | "account" | "member";

// Branded type for currency safety
export type AmountCents = number & { readonly __brand: "AmountCents" };

// =====================================================
// External Debt (loans from outside)
// =====================================================

export interface Debt {
  id: string;
  household_id: string;
  name: string;

  // Amount (always positive, in cents)
  original_amount_cents: number;
  // NOTE: No current_balance_cents - calculated from payments

  // Status management
  status: DebtStatus;

  // Timestamps
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  closed_at?: string; // ISO 8601 - temporal boundary for archived debts
}

// =====================================================
// Internal Debt (household borrowing)
// =====================================================

export interface InternalDebt {
  id: string;
  household_id: string;
  name: string;

  // Amount
  original_amount_cents: number;
  // NOTE: No current_balance_cents - calculated from payments

  // Source entity (who/what is lending)
  from_type: EntityType;
  from_id: string; // Soft reference - no FK constraint
  from_display_name: string; // Cached at creation (may become stale)

  // Destination entity (who/what is borrowing)
  to_type: EntityType;
  to_id: string; // Soft reference - no FK constraint
  to_display_name: string; // Cached at creation (may become stale)

  // Status management
  status: DebtStatus;

  // Timestamps
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

// =====================================================
// Debt Payment (immutable audit trail)
// =====================================================

export interface DebtPayment {
  id: string;
  household_id: string;

  // Debt linkage (one or the other, not both)
  debt_id?: string;
  internal_debt_id?: string;

  // Transaction linkage
  transaction_id: string;

  // Payment details
  amount_cents: number; // Positive for payment, negative for reversal
  payment_date: string; // DATE (YYYY-MM-DD) - user's local date
  device_id: string; // Device that created this payment

  // Reversal tracking (immutable - set once at creation)
  is_reversal: boolean; // True if this IS a reversal payment
  reverses_payment_id?: string; // Links to original payment if reversal
  adjustment_reason?: string; // Why reversal occurred

  // Overpayment tracking
  is_overpayment?: boolean; // True if payment exceeded balance
  overpayment_amount?: number; // Amount that exceeded balance

  // Timestamps
  created_at: string; // ISO 8601 (UTC)
}

// =====================================================
// Computed Types (for UI/queries)
// =====================================================

/**
 * Debt with calculated balance field
 * Balance = original_amount_cents - SUM(valid_payments)
 */
export interface DebtWithBalance extends Debt {
  current_balance_cents: number; // COMPUTED - not stored
}

/**
 * Internal debt with calculated balance
 */
export interface InternalDebtWithBalance extends InternalDebt {
  current_balance_cents: number; // COMPUTED - not stored
}

// =====================================================
// Form Data Types (for UI)
// =====================================================

export interface DebtFormData {
  name: string;
  original_amount_cents: number;
  household_id: string;
}

export interface InternalDebtFormData extends DebtFormData {
  from_type: EntityType;
  from_id: string;
  from_display_name: string;
  to_type: EntityType;
  to_id: string;
  to_display_name: string;
}

export interface DebtPaymentFormData {
  debt_id?: string;
  internal_debt_id?: string;
  transaction_id: string;
  amount_cents: number;
  payment_date: string;
}

// =====================================================
// Query Result Types
// =====================================================

/**
 * Payment with linked transaction and debt info
 */
export interface DebtPaymentWithDetails extends DebtPayment {
  transaction?: {
    type: string;
    account_id: string;
    transfer_group_id?: string;
  };
  debt?: {
    name: string;
    status: DebtStatus;
  };
}

/**
 * Debt summary for dashboards
 */
export interface DebtSummary {
  total_debts: number;
  active_debts: number;
  paid_off_debts: number;
  archived_debts: number;
  total_original_amount: number;
  total_current_balance: number;
  total_paid: number;
}
```

### 2.2 Export Types from Index

Modify `src/types/index.ts`:

```typescript
// src/types/index.ts
// ... existing exports ...

// Debt types
export * from "./debt";
```

---

## Step 3: Update Dexie Schema

Modify `src/lib/dexie/db.ts`:

### 3.1 Add Debt Tables to Schema

Find the section where Dexie versions are defined and add the new migration:

```typescript
// src/lib/dexie/db.ts
import Dexie, { Table } from "dexie";
import type {
  Transaction,
  Account,
  Category,
  // ... other existing types
} from "@/types";

// NEW: Import debt types
import type { Debt, InternalDebt, DebtPayment } from "@/types/debt";

// =====================================================
// Database Class
// =====================================================

export class HouseholdHubDB extends Dexie {
  // Existing tables
  transactions!: Table<Transaction>;
  accounts!: Table<Account>;
  categories!: Table<Category>;
  budgets!: Table<Budget>;
  profiles!: Table<Profile>;
  devices!: Table<Device>;
  events!: Table<Event>;
  syncQueue!: Table<SyncQueueItem>;
  meta!: Table<{ key: string; value: any }>;

  // NEW: Debt tables
  debts!: Table<Debt>;
  internalDebts!: Table<InternalDebt>;
  debtPayments!: Table<DebtPayment>;

  constructor() {
    super("HouseholdHubDB");

    // =====================================================
    // EXISTING VERSIONS (DO NOT MODIFY)
    // =====================================================
    // Keep all existing version definitions unchanged

    this.version(1).stores({
      // ... existing v1 schema
    });

    this.version(2).stores({
      // ... existing v2 schema
    });

    this.version(3).stores({
      // ... existing v3 schema
    });

    // =====================================================
    // NEW VERSION: Debt Tracking
    // =====================================================
    // CRITICAL: Set explicit version number (current + 1)
    const DEBT_MIGRATION_VERSION = 4; // ⚠️ UPDATE THIS based on your current version

    this.version(DEBT_MIGRATION_VERSION)
      .stores({
        // =====================================================
        // EXISTING TABLES (preserve all)
        // =====================================================
        transactions:
          "id, household_id, date, account_id, category_id, status, transfer_group_id, import_key, debt_id, internal_debt_id, *tagged_user_ids",
        accounts: "id, household_id, name, type, created_at",
        categories: "id, household_id, parent_id, name",
        budgets: "id, household_id, category_id, month_key",
        profiles: "id, household_id, email",
        devices: "id, user_id, household_id",
        events: "id, entity_type, entity_id, idempotency_key, created_at",
        syncQueue: "id, device_id, entity_type, status, created_at",
        meta: "key",

        // =====================================================
        // NEW: Debt Tables
        // =====================================================
        // External debts (no balance field - derived from payments)
        debts: "id, household_id, status, created_at, [household_id+status+updated_at]",

        // Internal debts (household borrowing)
        internalDebts:
          "id, household_id, from_type, from_id, to_type, to_id, status, created_at, [household_id+status+updated_at]",

        // Debt payments (immutable audit trail)
        debtPayments:
          "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
      })
      .upgrade(async (tx) => {
        console.log(`[Dexie Migration v${DEBT_MIGRATION_VERSION}] Adding debt tracking tables`);

        // Initialize lamport clock if not exists
        const meta = tx.table("meta");
        const existingClock = await meta.get("lamport_clock");

        if (!existingClock) {
          await meta.put({ key: "lamport_clock", value: 0 });
          console.log("[Dexie Migration] Initialized lamport_clock = 0");
        } else {
          console.log("[Dexie Migration] Lamport clock already exists:", existingClock.value);
        }

        // Check for any debt-linked transactions (unlikely in fresh migration)
        const transactions = tx.table("transactions");
        const debtLinkedCount = await transactions
          .filter((t) => t.debt_id || t.internal_debt_id)
          .count();

        if (debtLinkedCount > 0) {
          console.warn(
            `[Dexie Migration] Found ${debtLinkedCount} existing debt-linked transactions`
          );
          console.warn("[Dexie Migration] Payment records should be created via sync");
        }

        console.log(`[Dexie Migration v${DEBT_MIGRATION_VERSION}] Complete ✓`);
      });
  }
}

// Export singleton instance
export const db = new HouseholdHubDB();
```

**Important Index Notes**:

1. **Compound indexes** use `[field1+field2]` syntax:
   - `[household_id+status+updated_at]` - For filtered debt listings
   - `[debt_id+payment_date+created_at]` - For payment history with secondary sort

2. **Multi-entry indexes** use `*field` syntax:
   - `*tagged_user_ids` - For array fields (existing)

3. **No partial indexes**: Dexie doesn't support `WHERE` clauses - use `.filter()` in queries

### 3.2 Verify Index Syntax

**Common mistakes**:

```typescript
// ❌ WRONG: SQL-style syntax
debts: "id, household_id WHERE status = 'active'";

// ✅ CORRECT: Dexie syntax
debts: "id, household_id, status"; // Filter in query: .where('status').equals('active')

// ❌ WRONG: Nested arrays
debts: "id, [household_id, status]";

// ✅ CORRECT: Compound index
debts: "id, [household_id+status]";
```

---

## Step 4: Add Lamport Clock Helpers

Create utility functions in `src/lib/dexie/lamport-clock.ts`:

```typescript
// src/lib/dexie/lamport-clock.ts
/**
 * Lamport Clock Utilities
 *
 * Persistent monotonic counter for idempotency key generation
 * Survives browser refreshes and IndexedDB clears (syncs from server)
 */

import { db } from "./db";

/**
 * Get next lamport clock value (atomic increment)
 *
 * @returns Next clock value (1, 2, 3, ...)
 */
export async function getNextLamportClock(): Promise<number> {
  const meta = await db.meta.get("lamport_clock");
  const current = meta?.value || 0;
  const next = current + 1;

  await db.meta.put({ key: "lamport_clock", value: next });

  return next;
}

/**
 * Initialize lamport clock from server max value
 * Called during device setup to prevent key collisions
 *
 * @param deviceId - Current device ID
 */
export async function initializeLamportClock(deviceId: string): Promise<void> {
  const { supabase } = await import("@/lib/supabase");

  // Fetch max lamport clock from server for this device
  const { data, error } = await supabase.rpc("get_max_lamport_clock", { p_device_id: deviceId });

  if (error) {
    console.error("[Lamport Clock] Failed to fetch server max:", error);
    return;
  }

  const serverMax = data || 0;

  // Get local max
  const localMeta = await db.meta.get("lamport_clock");
  const localMax = localMeta?.value || 0;

  // Set to max(local, server) to prevent collisions
  const startClock = Math.max(localMax, serverMax);

  await db.meta.put({ key: "lamport_clock", value: startClock });

  console.log("[Lamport Clock] Initialized:", {
    deviceId,
    localMax,
    serverMax,
    startClock,
  });
}

/**
 * Get current lamport clock value (without incrementing)
 * Used for debugging and diagnostics
 */
export async function getCurrentLamportClock(): Promise<number> {
  const meta = await db.meta.get("lamport_clock");
  return meta?.value || 0;
}
```

---

## Step 5: Create Migration Test

Create test file: `src/__tests__/dexie-migration.test.ts`

```typescript
// src/__tests__/dexie-migration.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";

describe("Dexie Debt Migration", () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.delete();
    await db.open();
  });

  it("should create debt tables", async () => {
    // Verify tables exist
    expect(db.debts).toBeDefined();
    expect(db.internalDebts).toBeDefined();
    expect(db.debtPayments).toBeDefined();

    // Verify tables are empty
    expect(await db.debts.count()).toBe(0);
    expect(await db.internalDebts.count()).toBe(0);
    expect(await db.debtPayments.count()).toBe(0);
  });

  it("should initialize lamport clock in meta table", async () => {
    const meta = await db.meta.get("lamport_clock");

    expect(meta).toBeDefined();
    expect(meta?.key).toBe("lamport_clock");
    expect(meta?.value).toBe(0);
  });

  it("should allow debt insertions", async () => {
    const debt = {
      id: "test-debt-1",
      household_id: "household-1",
      name: "Test Car Loan",
      original_amount_cents: 100000,
      status: "active" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.debts.add(debt);

    const retrieved = await db.debts.get("test-debt-1");
    expect(retrieved).toEqual(debt);
  });

  it("should allow internal debt insertions", async () => {
    const internalDebt = {
      id: "test-internal-1",
      household_id: "household-1",
      name: "Category Borrowing",
      original_amount_cents: 50000,
      from_type: "category" as const,
      from_id: "cat-groceries",
      from_display_name: "Groceries",
      to_type: "category" as const,
      to_id: "cat-entertainment",
      to_display_name: "Entertainment",
      status: "active" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.internalDebts.add(internalDebt);

    const retrieved = await db.internalDebts.get("test-internal-1");
    expect(retrieved).toEqual(internalDebt);
  });

  it("should allow debt payment insertions", async () => {
    const payment = {
      id: "test-payment-1",
      household_id: "household-1",
      debt_id: "debt-1",
      transaction_id: "txn-1",
      amount_cents: 10000,
      payment_date: "2025-11-10",
      device_id: "device-123",
      is_reversal: false,
      created_at: new Date().toISOString(),
    };

    await db.debtPayments.add(payment);

    const retrieved = await db.debtPayments.get("test-payment-1");
    expect(retrieved).toEqual(payment);
  });

  it("should support compound index queries", async () => {
    // Add debts with different statuses
    await db.debts.bulkAdd([
      {
        id: "debt-1",
        household_id: "household-1",
        name: "Active Debt",
        original_amount_cents: 100000,
        status: "active",
        created_at: "2025-11-01T00:00:00Z",
        updated_at: "2025-11-01T00:00:00Z",
      },
      {
        id: "debt-2",
        household_id: "household-1",
        name: "Paid Off Debt",
        original_amount_cents: 50000,
        status: "paid_off",
        created_at: "2025-11-05T00:00:00Z",
        updated_at: "2025-11-05T00:00:00Z",
      },
      {
        id: "debt-3",
        household_id: "household-1",
        name: "Another Active",
        original_amount_cents: 75000,
        status: "active",
        created_at: "2025-11-10T00:00:00Z",
        updated_at: "2025-11-10T00:00:00Z",
      },
    ]);

    // Query using compound index [household_id+status+updated_at]
    const activeDebts = await db.debts
      .where("[household_id+status]")
      .equals(["household-1", "active"])
      .toArray();

    expect(activeDebts).toHaveLength(2);
    expect(activeDebts.every((d) => d.status === "active")).toBe(true);
  });

  it("should support payment history queries with secondary sort", async () => {
    const debtId = "debt-123";

    // Add payments on same date
    await db.debtPayments.bulkAdd([
      {
        id: "payment-1",
        household_id: "household-1",
        debt_id: debtId,
        transaction_id: "txn-1",
        amount_cents: 5000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: "2025-11-10T10:00:00Z",
      },
      {
        id: "payment-2",
        household_id: "household-1",
        debt_id: debtId,
        transaction_id: "txn-2",
        amount_cents: 3000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: "2025-11-10T12:00:00Z", // Later same day
      },
    ]);

    // Query using compound index [debt_id+payment_date+created_at]
    const payments = await db.debtPayments
      .where("debt_id")
      .equals(debtId)
      .reverse() // DESC order
      .toArray();

    // Should be sorted by payment_date DESC, then created_at DESC
    expect(payments).toHaveLength(2);
    expect(payments[0].id).toBe("payment-2"); // Later timestamp first
    expect(payments[1].id).toBe("payment-1");
  });

  it("should verify no balance field exists", async () => {
    const debt = {
      id: "test-debt",
      household_id: "household-1",
      name: "Test",
      original_amount_cents: 10000,
      // @ts-expect-error - Testing that current_balance_cents doesn't exist
      current_balance_cents: 5000, // Should be ignored by schema
      status: "active" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.debts.add(debt);

    const retrieved = await db.debts.get("test-debt");
    // @ts-expect-error - Accessing non-existent field
    expect(retrieved.current_balance_cents).toBeUndefined();
  });
});
```

---

## Step 6: Run Tests

```bash
# Run migration tests
npm test dexie-migration

# Expected output:
# ✓ should create debt tables
# ✓ should initialize lamport clock in meta table
# ✓ should allow debt insertions
# ✓ should allow internal debt insertions
# ✓ should allow debt payment insertions
# ✓ should support compound index queries
# ✓ should support payment history queries with secondary sort
# ✓ should verify no balance field exists
```

---

## Step 7: Verify in Browser

### 7.1 Open Browser Console

```typescript
// Import database
import { db } from "@/lib/dexie/db";

// Check version
console.log("Database version:", db.verno);
// Expected: Your DEBT_MIGRATION_VERSION (e.g., 4)

// List all tables
console.log(
  "Tables:",
  db.tables.map((t) => t.name)
);
// Expected: [...existing, 'debts', 'internalDebts', 'debtPayments']

// Check lamport clock
const meta = await db.meta.get("lamport_clock");
console.log("Lamport clock:", meta?.value);
// Expected: 0
```

### 7.2 Test CRUD Operations

```typescript
// Create test debt
await db.debts.add({
  id: "test-1",
  household_id: "00000000-0000-0000-0000-000000000001",
  name: "Browser Test Debt",
  original_amount_cents: 100000,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Retrieve
const debt = await db.debts.get("test-1");
console.log("Created debt:", debt);

// Query by household and status
const activeDebts = await db.debts
  .where("[household_id+status]")
  .equals(["00000000-0000-0000-0000-000000000001", "active"])
  .toArray();
console.log("Active debts:", activeDebts);

// Cleanup
await db.debts.delete("test-1");
```

---

## Step 8: Update Package.json Scripts (Optional)

Add convenience scripts for Dexie debugging:

```json
{
  "scripts": {
    "db:version": "node -e \"import('./src/lib/dexie/db.js').then(m => console.log('Version:', m.db.verno))\"",
    "db:clear": "node -e \"import('./src/lib/dexie/db.js').then(m => m.db.delete().then(() => console.log('Database cleared')))\"",
    "db:export": "node scripts/export-indexeddb.js"
  }
}
```

---

## Verification Checklist

After completing implementation:

- [ ] Current Dexie version identified
- [ ] `DEBT_MIGRATION_VERSION` set explicitly (not dynamic)
- [ ] TypeScript interfaces created in `src/types/debt.ts`
- [ ] Debt types exported from `src/types/index.ts`
- [ ] Dexie schema updated with 3 new tables
- [ ] Compound indexes defined correctly
- [ ] Lamport clock utilities created
- [ ] Migration upgrade function logs correctly
- [ ] All migration tests pass (`npm test dexie-migration`)
- [ ] Browser console verification successful
- [ ] CRUD operations work in browser
- [ ] No `current_balance_cents` field in schema (critical!)
- [ ] Meta table has `lamport_clock` initialized to 0
- [ ] TypeScript compilation passes (`npm run build`)

---

## Troubleshooting

See `VERIFICATION.md` for common issues and solutions.

**Next**: Proceed to `VERIFICATION.md` for comprehensive testing
