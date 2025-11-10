# D4 Verification: Debt CRUD Operations

## Quick Verification (3 minutes)

```bash
npm test src/lib/debts
# Expected: All tests pass (40+ total including D3)
```

---

## Part 1: Create Operations

### External Debt Creation

```typescript
import { createExternalDebt } from "@/lib/debts/crud";

const debt = await createExternalDebt({
  name: "Test Car Loan",
  original_amount_cents: 500000,
  household_id: "household-1",
});

console.assert(debt.id !== undefined, "ID generated");
console.assert(debt.status === "active", "Default status active");
```

### Validation Tests

```typescript
// Should reject invalid amount
await createExternalDebt({
  name: "Invalid",
  original_amount_cents: 50, // Below ₱1.00
  household_id: "household-1",
});
// Expected: Error "Amount must be at least ₱1.00"

// Should reject duplicate name
await createExternalDebt({ name: "Car Loan", original_amount_cents: 100000, household_id: "h1" });
await createExternalDebt({ name: "Car Loan", original_amount_cents: 200000, household_id: "h1" });
// Expected: Error "already exists"
```

---

## Part 2: Read Operations

### List Debts

```typescript
import { listDebts } from "@/lib/debts/crud";

const debts = await listDebts("household-1", "external");
console.log("Total debts:", debts.length);

// With filters
const active = await listDebts("household-1", "external", { status: "active" });
console.log("Active debts:", active.length);
```

### Get With Balance

```typescript
import { getDebtWithBalance } from "@/lib/debts/crud";

const debt = await getDebtWithBalance("debt-id", "external");
console.log("Balance:", debt?.current_balance_cents);
// Should include calculated balance field
```

---

## Part 3: Update Operations

### Rename Debt

```typescript
import { updateDebtName } from "@/lib/debts/crud";

await updateDebtName("debt-id", "external", "New Name");
// Verify name changed
const updated = await getDebt("debt-id", "external");
console.assert(updated?.name === "New Name");
```

### Archive Debt

```typescript
import { archiveDebt } from "@/lib/debts/crud";

await archiveDebt("debt-id", "external");
const archived = await getDebt("debt-id", "external");
console.assert(archived?.status === "archived");
console.assert(archived?.closed_at !== undefined);
```

---

## Part 4: Delete Operations

### Safe Deletion

```typescript
import { deleteDebt } from '@/lib/debts/crud';

// Create debt with no payments
const debt = await createExternalDebt({...});
await deleteDebt(debt.id, 'external');
// Should succeed

// Try to delete with payments
const debt2 = await createExternalDebt({...});
await db.debtPayments.add({ debt_id: debt2.id, ... });
await deleteDebt(debt2.id, 'external');
// Expected: Error "Cannot delete debt with payment history"
```

---

## Final Checklist

- [ ] Create operations work
- [ ] Validation errors clear
- [ ] Name uniqueness enforced (active only)
- [ ] Read operations return correct data
- [ ] Update operations persist changes
- [ ] Archive sets status and closed_at
- [ ] Delete blocked with payments
- [ ] All 25+ tests pass

**Status**: ✅ Chunk D4 Complete

**Next Chunk**: D5 - Payment Processing Core
