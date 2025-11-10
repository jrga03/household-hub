# Chunk D3: Balance Calculation & Status Logic

## At a Glance

- **Time**: 1 hour
- **Prerequisites**: D2 (Dexie Setup) complete
- **Can Skip**: No - core business logic for debt tracking
- **Depends On**: Dexie schema with debts, internalDebts, debtPayments tables

## What You're Building

Core business logic for derived balances and automatic status management:

- **Balance calculation function**: Derives current balance from payment history
- **Status transition logic**: Auto-updates status based on balance
- **Reversal filtering**: O(1) lookups for reversed payments
- **Overpayment handling**: Supports negative balances
- **Dual debt type support**: Works for both external and internal debts
- **Unit tests**: Comprehensive test coverage for all scenarios

## Why This Matters

Balance calculation is the **heart of the debt tracking system**:

- **Single source of truth**: Balance derived from immutable payment history
- **Conflict-free**: No stored balance field eliminates sync conflicts
- **Automatic status**: Status reflects actual balance, not stale data
- **Performance**: O(n) calculation with O(1) reversal filtering
- **Correctness**: Handles edge cases (overpayments, reversals, concurrent edits)

This chunk implements the core architectural decision from DEBT-DECISIONS.md #1 (Derived Balances).

## Before You Start

Verify these prerequisites:

- [ ] **Chunk D2 complete** - Dexie schema with debt tables exists
- [ ] **TypeScript interfaces** available from `@/types/debt`
- [ ] **Currency utilities** exist: `formatPHP()` from `@/lib/currency`
- [ ] **Vitest configured** - Can run unit tests
- [ ] **Understanding of event sourcing** - Compensating events pattern

**How to verify**:

```typescript
import { db } from "@/lib/dexie/db";
import { formatPHP } from "@/lib/currency";

console.log("Has debts table:", db.debts !== undefined);
console.log("Can format currency:", formatPHP(150050)); // "₱1,500.50"
```

## What Happens Next

After this chunk:

- Balance calculations work offline
- Status automatically reflects current balance
- Overpayments tracked and displayed
- Ready for Chunk D4 (Debt CRUD Operations)

## Key Files Created

```
src/
├── lib/
│   └── debts/
│       ├── balance.ts              # Balance calculation logic
│       ├── status.ts               # Status transition logic
│       └── __tests__/
│           ├── balance.test.ts     # Balance calculation tests
│           └── status.test.ts      # Status transition tests
└── types/
    └── debt.ts                     # MODIFIED: Add helper types
```

## Features Included

### Balance Calculation

**calculateDebtBalance()**:

- Fetches all payments for debt
- Pre-computes reversed payment IDs (O(1) lookups)
- Filters out reversals AND reversed payments
- Sums valid payments
- Returns: `original_amount - total_paid` (can be negative)

**calculateDebtBalanceWithDetails()**:

- Returns balance + breakdown
- Includes: total paid, payment count, overpayment amount
- Used for detailed displays

### Status Transitions

**updateDebtStatusFromBalance()**:

- Calculates current balance
- Auto-transitions: `active → paid_off` when balance ≤ 0
- Auto-transitions: `paid_off → active` when balance > 0 (reversal)
- Preserves `archived` status (terminal state)
- Sets `closed_at` timestamp

### Overpayment Handling

**Negative Balance Support**:

- Balance = -5000 means overpaid by ₱50.00
- Status still becomes `paid_off`
- `overpayment_amount` tracked in payment records
- UI displays: "Overpaid by ₱50.00"

### Performance Optimizations

**Reversal Filtering**:

```typescript
// O(n) pre-computation for O(1) lookups
const reversedIds = new Set(
  payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id)
);

// O(1) check per payment
const validPayments = payments.filter((p) => !p.is_reversal && !reversedIds.has(p.id));
```

## Related Documentation

- **Balance Calculation**: `debt-implementation.md` lines 302-337 (calculateDebtBalance function)
- **Status Updates**: `debt-implementation.md` lines 340-365 (updateDebtStatusFromBalance)
- **Validation**: `DEBT-VALIDATION.md` lines 8-75 (state machine, transitions)
- **Decisions**:
  - #1: Derived balances (DEBT-DECISIONS.md lines 9-37)
  - #2: Compensating events (DEBT-DECISIONS.md lines 40-101)
  - #4: Overpayment handling (DEBT-DECISIONS.md lines 172-240)

## Technical Stack

- **TypeScript**: Type-safe calculations
- **Dexie.js**: Query payment history
- **Vitest**: Unit testing framework
- **Currency utilities**: PHP formatting

## Design Patterns

### Derived Value Pattern

```typescript
// NEVER stored in database
async function calculateDebtBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<number> {
  const debt = await getDebt(debtId, type);
  const payments = await getPayments(debtId, type);

  // Calculation happens at read time
  return debt.original_amount_cents - sumValidPayments(payments);
}
```

**Why**: Single source of truth, conflict-free, always accurate.

### State Machine Pattern

```typescript
// Status transitions based on balance
active → paid_off      // balance ≤ 0 (automatic)
paid_off → active      // balance > 0 (reversal occurred)
archived → [terminal]  // No automatic transitions
```

**Why**: Predictable state management, no manual status updates needed.

### Filter-Map-Reduce Pattern

```typescript
// 1. Filter: Remove invalid payments
const reversedIds = new Set(/* ... */);
const validPayments = payments.filter((p) => !p.is_reversal && !reversedIds.has(p.id));

// 2. Map: Extract amounts
const amounts = validPayments.map((p) => p.amount_cents);

// 3. Reduce: Sum total
const totalPaid = amounts.reduce((sum, amt) => sum + amt, 0);
```

**Why**: Functional, testable, easy to reason about.

### Two-Phase Validation Pattern

```typescript
// Phase 1: Calculate balance
const balance = await calculateDebtBalance(debtId, type);

// Phase 2: Update status if needed
if (balance <= 0 && status === "active") {
  await updateStatus("paid_off");
} else if (balance > 0 && status === "paid_off") {
  await updateStatus("active");
}
```

**Why**: Separation of calculation and side effects.

## Critical Concepts

**Negative Balances Are Valid**: A balance of -500 cents means the debt is overpaid by ₱5.00. This is expected and normal. The status should still be `paid_off`, not an error state.

**Reversal Filtering**: When a payment is reversed, TWO records exist:

1. Original payment (amount: +1000, is_reversal: false)
2. Reversal record (amount: -1000, is_reversal: true, reverses_payment_id: original.id)

The balance calculation must **exclude both** to avoid double-counting.

**Status Terminal State**: `archived` status is **terminal** - it never auto-transitions back to `active` or `paid_off`. Only manual user action can change archived status.

**Closed At Timestamp**: The `closed_at` field creates a **temporal boundary** for archived debts. Payments dated after `closed_at` are rejected during sync (validation happens in sync logic, not here).

**Type Duality**: Every function supports both `external` and `internal` debt types with a single implementation. The only difference is which table to query (`debts` vs `internalDebts`, `debt_id` vs `internal_debt_id`).

## Edge Cases Handled

1. **No payments yet**: Balance = original_amount (100% owed)
2. **Exact payoff**: Balance = 0 → status = paid_off
3. **Overpayment**: Balance < 0 → status = paid_off, track overpayment
4. **Full reversal**: All payments reversed → balance = original_amount
5. **Partial reversal**: Some payments reversed → balance recalculated
6. **Concurrent overpayments**: Two devices pay full balance while offline → both marked as overpayments, balance becomes negative
7. **Archived debt**: Status never auto-updates (preserved)
8. **Deleted debt**: Balance calculation returns 0 (defensive)

## Performance Characteristics

**Time Complexity**:

- Balance calculation: O(n) where n = number of payments
- Reversal filtering: O(n) pre-computation + O(1) per payment
- Status update: O(1) database write

**Space Complexity**:

- O(n) for payment array
- O(r) for reversed IDs set where r = number of reversals

**Typical Performance** (1000 payments):

- Balance calculation: ~10ms
- With 100 reversals: ~12ms (Set lookup is fast)
- Status update: <1ms

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
