# D2 Verification: Dexie Schema & Offline Setup

## Quick Verification (3 minutes)

Open browser console and run:

```javascript
// 1. Import database
import { db } from "@/lib/dexie/db";

// 2. Check version
console.log("Version:", db.verno);
// Expected: Your DEBT_MIGRATION_VERSION (e.g., 4)

// 3. Check tables exist
const tables = db.tables.map((t) => t.name);
console.log("Has debts:", tables.includes("debts"));
console.log("Has internalDebts:", tables.includes("internalDebts"));
console.log("Has debtPayments:", tables.includes("debtPayments"));
// Expected: All true

// 4. Check lamport clock
const meta = await db.meta.get("lamport_clock");
console.log("Lamport clock:", meta?.value);
// Expected: 0 (or higher if already used)

// 5. Check no balance field
const debt = await db.debts.limit(1).first();
console.log("Has balance field:", debt && "current_balance_cents" in debt);
// Expected: false (or undefined if no debts)
```

**If all checks pass**, proceed to detailed verification below.

---

## Part 1: Schema Structure Verification

### 1.1 Verify Table Definitions

```javascript
import { db } from "@/lib/dexie/db";

// Get table schemas
const debtsSchema = db.debts.schema;
console.log(
  "Debts indexes:",
  debtsSchema.indexes.map((i) => i.name)
);
// Expected: id, household_id, status, created_at, [household_id+status+updated_at]

const internalDebtsSchema = db.internalDebts.schema;
console.log(
  "Internal debts indexes:",
  internalDebtsSchema.indexes.map((i) => i.name)
);
// Expected: id, household_id, from_type, from_id, to_type, to_id, status, created_at, [household_id+status+updated_at]

const paymentsSchema = db.debtPayments.schema;
console.log(
  "Payments indexes:",
  paymentsSchema.indexes.map((i) => i.name)
);
// Expected: id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, [debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]
```

### 1.2 Verify Compound Indexes

```javascript
// Test compound index exists and works
const compound = db.debts.schema.indexes.find((i) => i.name === "[household_id+status+updated_at]");

console.log("Compound index found:", compound !== undefined);
console.log("Compound index keyPath:", compound?.keyPath);
// Expected: ['household_id', 'status', 'updated_at']
```

### 1.3 Verify TypeScript Types

In your TypeScript code (not console):

```typescript
import type { Debt, InternalDebt, DebtPayment } from "@/types/debt";

// Type checking should work
const debt: Debt = {
  id: "test",
  household_id: "household-1",
  name: "Test",
  original_amount_cents: 10000,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// This should cause TypeScript error:
// @ts-expect-error - balance field doesn't exist
const invalidDebt: Debt = {
  ...debt,
  current_balance_cents: 5000, // Error: Object literal may only specify known properties
};
```

---

## Part 2: Migration Testing

### 2.1 Fresh Database Migration

```javascript
import { db } from "@/lib/dexie/db";

// Delete and recreate database
await db.delete();
await db.open();

// Verify version
console.log("Version after fresh migration:", db.verno);
// Expected: DEBT_MIGRATION_VERSION

// Verify tables are empty
console.log("Debts count:", await db.debts.count());
console.log("Internal debts count:", await db.internalDebts.count());
console.log("Payments count:", await db.debtPayments.count());
// Expected: All 0

// Verify lamport clock initialized
const meta = await db.meta.get("lamport_clock");
console.log("Lamport clock after fresh migration:", meta?.value);
// Expected: 0
```

### 2.2 Migration with Existing Data

```javascript
// Add test data before migration
await db.delete();
await db.open();

// Add transactions (simulate existing data)
await db.transactions.add({
  id: "txn-1",
  household_id: "household-1",
  amount_cents: 5000,
  type: "expense",
  date: "2025-11-10",
  account_id: "account-1",
  created_at: new Date().toISOString(),
});

// Close and reopen to trigger migration
await db.close();
await db.open();

// Verify existing data preserved
const txn = await db.transactions.get("txn-1");
console.log("Transaction preserved:", txn !== undefined);
// Expected: true

// Verify new tables added
console.log(
  "New tables exist:",
  db.debts !== undefined && db.internalDebts !== undefined && db.debtPayments !== undefined
);
// Expected: true
```

---

## Part 3: CRUD Operations Testing

### 3.1 Debt CRUD

```javascript
import { db } from "@/lib/dexie/db";

// CREATE
const debtId = crypto.randomUUID();
await db.debts.add({
  id: debtId,
  household_id: "household-1",
  name: "Test Car Loan",
  original_amount_cents: 500000, // ₱5,000
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

console.log("✓ Created debt");

// READ
const debt = await db.debts.get(debtId);
console.log("Retrieved debt:", debt?.name);
// Expected: "Test Car Loan"

// UPDATE
await db.debts.update(debtId, {
  status: "paid_off",
  closed_at: new Date().toISOString(),
});

const updated = await db.debts.get(debtId);
console.log("Updated status:", updated?.status);
// Expected: "paid_off"

// DELETE
await db.debts.delete(debtId);
const deleted = await db.debts.get(debtId);
console.log("Deleted successfully:", deleted === undefined);
// Expected: true
```

### 3.2 Internal Debt CRUD

```javascript
// CREATE with typed entity references
const internalDebtId = crypto.randomUUID();
await db.internalDebts.add({
  id: internalDebtId,
  household_id: "household-1",
  name: "Category Borrowing",
  original_amount_cents: 25000, // ₱250
  from_type: "category",
  from_id: "cat-groceries",
  from_display_name: "Groceries",
  to_type: "category",
  to_id: "cat-entertainment",
  to_display_name: "Entertainment",
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

console.log("✓ Created internal debt");

// QUERY by entity type
const categoryDebts = await db.internalDebts.where("from_type").equals("category").toArray();

console.log("Category debts found:", categoryDebts.length);
// Expected: >= 1

// CLEANUP
await db.internalDebts.delete(internalDebtId);
```

### 3.3 Debt Payment CRUD

```javascript
// CREATE payment
const paymentId = crypto.randomUUID();
await db.debtPayments.add({
  id: paymentId,
  household_id: "household-1",
  debt_id: "debt-123",
  transaction_id: "txn-456",
  amount_cents: 10000, // ₱100
  payment_date: "2025-11-10",
  device_id: "device-abc",
  is_reversal: false,
  created_at: new Date().toISOString(),
});

console.log("✓ Created payment");

// QUERY by debt_id
const payments = await db.debtPayments.where("debt_id").equals("debt-123").toArray();

console.log("Payments for debt:", payments.length);
// Expected: >= 1

// CREATE reversal payment
const reversalId = crypto.randomUUID();
await db.debtPayments.add({
  id: reversalId,
  household_id: "household-1",
  debt_id: "debt-123",
  transaction_id: "txn-456",
  amount_cents: -10000, // Negative
  payment_date: "2025-11-10",
  device_id: "device-abc",
  is_reversal: true,
  reverses_payment_id: paymentId,
  adjustment_reason: "Transaction edited",
  created_at: new Date().toISOString(),
});

console.log("✓ Created reversal");

// CLEANUP
await db.debtPayments.bulkDelete([paymentId, reversalId]);
```

---

## Part 4: Index Performance Testing

### 4.1 Test Compound Index Queries

```javascript
import { db } from "@/lib/dexie/db";

// Add test data
await db.debts.bulkAdd([
  {
    id: "debt-1",
    household_id: "household-1",
    name: "Active 1",
    original_amount_cents: 10000,
    status: "active",
    created_at: "2025-11-01T00:00:00Z",
    updated_at: "2025-11-05T00:00:00Z",
  },
  {
    id: "debt-2",
    household_id: "household-1",
    name: "Active 2",
    original_amount_cents: 20000,
    status: "active",
    created_at: "2025-11-02T00:00:00Z",
    updated_at: "2025-11-10T00:00:00Z", // More recent
  },
  {
    id: "debt-3",
    household_id: "household-1",
    name: "Paid Off",
    original_amount_cents: 30000,
    status: "paid_off",
    created_at: "2025-11-03T00:00:00Z",
    updated_at: "2025-11-15T00:00:00Z",
  },
]);

// Query using compound index (should be fast)
console.time("Compound index query");
const activeDebts = await db.debts
  .where("[household_id+status]")
  .equals(["household-1", "active"])
  .reverse() // Sort by updated_at DESC
  .toArray();
console.timeEnd("Compound index query");

console.log(
  "Active debts (sorted by updated_at DESC):",
  activeDebts.map((d) => d.name)
);
// Expected: ['Active 2', 'Active 1'] (newer first)

// Cleanup
await db.debts.bulkDelete(["debt-1", "debt-2", "debt-3"]);
```

### 4.2 Test Payment History Index

```javascript
// Add payments on same date (tests secondary sort)
const debtId = "debt-test";
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
    created_at: "2025-11-10T15:00:00Z", // Later same day
  },
  {
    id: "payment-3",
    household_id: "household-1",
    debt_id: debtId,
    transaction_id: "txn-3",
    amount_cents: 7000,
    payment_date: "2025-11-11",
    device_id: "device-1",
    is_reversal: false,
    created_at: "2025-11-11T09:00:00Z",
  },
]);

// Query payment history (should use compound index)
console.time("Payment history query");
const history = await db.debtPayments
  .where("debt_id")
  .equals(debtId)
  .reverse() // DESC order
  .toArray();
console.timeEnd("Payment history query");

console.log(
  "Payment order (payment_date DESC, created_at DESC):",
  history.map((p) => ({ id: p.id, date: p.payment_date, time: p.created_at }))
);
// Expected order: payment-3 (2025-11-11), payment-2 (15:00), payment-1 (10:00)

// Verify sort order
console.assert(history[0].id === "payment-3", "Most recent payment first");
console.assert(history[1].id === "payment-2", "Later timestamp on same day");
console.assert(history[2].id === "payment-1", "Earlier timestamp last");

// Cleanup
await db.debtPayments.bulkDelete(["payment-1", "payment-2", "payment-3"]);
```

---

## Part 5: Lamport Clock Testing

### 5.1 Test Clock Increment

```javascript
import { getNextLamportClock, getCurrentLamportClock } from "@/lib/dexie/lamport-clock";

// Get current value
const current = await getCurrentLamportClock();
console.log("Current clock:", current);

// Increment 5 times
const clocks = [];
for (let i = 0; i < 5; i++) {
  clocks.push(await getNextLamportClock());
}

console.log("Generated clocks:", clocks);
// Expected: [current+1, current+2, current+3, current+4, current+5]

// Verify monotonic increase
console.assert(
  clocks.every((c, i) => i === 0 || c === clocks[i - 1] + 1),
  "Clocks should increment by 1"
);
```

### 5.2 Test Clock Persistence

```javascript
// Get clock value
const before = await getNextLamportClock();
console.log("Clock before close:", before);

// Close and reopen database
await db.close();
await db.open();

// Get clock value again
const after = await getNextLamportClock();
console.log("Clock after reopen:", after);

// Should continue from where it left off
console.assert(after === before + 1, "Clock should persist across sessions");
```

---

## Part 6: Unit Test Verification

Run the migration test suite:

```bash
npm test dexie-migration
```

**Expected output**:

```
 ✓ src/__tests__/dexie-migration.test.ts (8)
   ✓ Dexie Debt Migration (8)
     ✓ should create debt tables
     ✓ should initialize lamport clock in meta table
     ✓ should allow debt insertions
     ✓ should allow internal debt insertions
     ✓ should allow debt payment insertions
     ✓ should support compound index queries
     ✓ should support payment history queries with secondary sort
     ✓ should verify no balance field exists

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  12:34:56
   Duration  123ms
```

If any tests fail, see Troubleshooting section below.

---

## Part 7: Type Safety Verification

### 7.1 Test Type Checking

Create a test TypeScript file to verify types:

```typescript
// test-types.ts
import type { Debt, InternalDebt, DebtPayment } from "@/types/debt";

// ✅ Valid debt object
const validDebt: Debt = {
  id: "debt-1",
  household_id: "household-1",
  name: "Car Loan",
  original_amount_cents: 500000,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ❌ Should cause type error: unknown property
// @ts-expect-error
const invalidDebt: Debt = {
  ...validDebt,
  current_balance_cents: 250000, // Error!
};

// ✅ Valid internal debt
const validInternalDebt: InternalDebt = {
  id: "internal-1",
  household_id: "household-1",
  name: "Category Borrowing",
  original_amount_cents: 25000,
  from_type: "category",
  from_id: "cat-1",
  from_display_name: "Groceries",
  to_type: "category",
  to_id: "cat-2",
  to_display_name: "Entertainment",
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ❌ Should cause type error: invalid entity type
// @ts-expect-error
const invalidEntityType: InternalDebt = {
  ...validInternalDebt,
  from_type: "invalid", // Error! Not in 'category' | 'account' | 'member'
};

// ✅ Valid payment
const validPayment: DebtPayment = {
  id: "payment-1",
  household_id: "household-1",
  debt_id: "debt-1",
  transaction_id: "txn-1",
  amount_cents: 10000,
  payment_date: "2025-11-10",
  device_id: "device-abc",
  is_reversal: false,
  created_at: new Date().toISOString(),
};

// ❌ Should cause type error: missing required field
// @ts-expect-error
const missingField: DebtPayment = {
  id: "payment-2",
  household_id: "household-1",
  // Missing transaction_id - Error!
  amount_cents: 5000,
  payment_date: "2025-11-10",
  device_id: "device-xyz",
  is_reversal: false,
  created_at: new Date().toISOString(),
};
```

Run TypeScript compiler to verify:

```bash
npx tsc --noEmit test-types.ts
```

**Expected**: Only the `@ts-expect-error` lines should produce errors (which are suppressed by the directive).

---

## Troubleshooting

### Issue: "Version mismatch" error on migration

**Cause**: Database has higher version than code expects

**Solution**:

```javascript
// Check database version
import { db } from "@/lib/dexie/db";
console.log("DB version:", db.verno);

// If version is wrong, delete and recreate
await db.delete();
await db.open();
```

### Issue: Compound index not working

**Symptoms**: Query is slow or returns wrong results

**Debug**:

```javascript
// Check if index exists
const schema = db.debts.schema;
const compoundIndex = schema.indexes.find((i) => i.name === "[household_id+status+updated_at]");

console.log("Compound index:", compoundIndex);
// Should show: { name: '[household_id+status+updated_at]', keyPath: [...] }

// If missing, verify IMPLEMENTATION.md Step 3.1 syntax
```

**Common mistakes**:

```typescript
// ❌ Wrong: Nested array
debts: "id, [household_id, [status, updated_at]]";

// ✅ Correct: Flat compound
debts: "id, [household_id+status+updated_at]";
```

### Issue: TypeScript errors on import

**Symptoms**: `Cannot find module '@/types/debt'`

**Solution**:

1. Verify file exists: `src/types/debt.ts`
2. Check export in `src/types/index.ts`:
   ```typescript
   export * from "./debt";
   ```
3. Verify path alias in `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```

### Issue: Lamport clock not incrementing

**Debug**:

```javascript
import { db } from "@/lib/dexie/db";

// Check meta table
const meta = await db.meta.get("lamport_clock");
console.log("Clock value:", meta);

// If undefined, migration didn't run
if (!meta) {
  await db.meta.put({ key: "lamport_clock", value: 0 });
}
```

### Issue: Migration runs multiple times

**Symptoms**: Console logs show "Adding debt tracking tables" on every page load

**Cause**: Using dynamic version (`db.verno + 1`)

**Solution**: Use explicit version number (see IMPLEMENTATION.md Step 1.2)

```typescript
// ❌ WRONG
this.version(this.verno + 1).stores({ ... });

// ✅ CORRECT
const DEBT_MIGRATION_VERSION = 4;  // Hardcoded
this.version(DEBT_MIGRATION_VERSION).stores({ ... });
```

### Issue: Tests fail with "Table does not exist"

**Cause**: Test database not initialized

**Solution**: Add `beforeEach` hook to clear database:

```typescript
beforeEach(async () => {
  await db.delete();
  await db.open();
});
```

### Issue: "QuotaExceededError" when testing

**Cause**: IndexedDB storage limit reached

**Solution**:

```javascript
// Check storage usage
const estimate = await navigator.storage.estimate();
console.log("Storage used:", ((estimate.usage / estimate.quota) * 100).toFixed(1), "%");

// Clear database
await db.delete();
await db.open();
```

---

## Performance Benchmarks

Run these benchmarks to verify performance:

```javascript
// Benchmark: Insert 1000 debts
console.time('Insert 1000 debts');
const debts = Array.from({ length: 1000 }, (_, i) => ({
  id: `debt-${i}`,
  household_id: 'household-1',
  name: `Debt ${i}`,
  original_amount_cents: Math.floor(Math.random() * 1000000),
  status: 'active' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

await db.debts.bulkAdd(debts);
console.timeEnd('Insert 1000 debts');
// Expected: < 100ms

// Benchmark: Query with compound index
console.time('Query 1000 debts');
const results = await db.debts
  .where('[household_id+status]')
  .equals(['household-1', 'active'])
  .toArray();
console.timeEnd('Query 1000 debts');
// Expected: < 50ms

console.log('Found:', results.length);

// Cleanup
await db.debts.clear();
```

**Expected performance**:

- Insert 1000 records: < 100ms
- Query with compound index: < 50ms
- Lamport clock increment: < 1ms

---

## Final Checklist

Before moving to Chunk D3:

- [ ] Dexie schema version incremented explicitly
- [ ] All 3 debt tables created
- [ ] Compound indexes defined correctly
- [ ] TypeScript interfaces created and exported
- [ ] Lamport clock utilities created
- [ ] Meta table has lamport_clock initialized
- [ ] All unit tests pass (8/8)
- [ ] Browser console verification successful
- [ ] CRUD operations work correctly
- [ ] Compound index queries work
- [ ] Payment history sorting correct (secondary sort)
- [ ] Lamport clock increments and persists
- [ ] No `current_balance_cents` field exists
- [ ] Type safety verified with TypeScript compiler
- [ ] Performance benchmarks meet targets

---

**Status**: ✅ Chunk D2 Complete

**Next Chunk**: D3 - Balance Calculation & Status Logic
