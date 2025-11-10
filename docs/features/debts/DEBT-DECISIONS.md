# Debt Tracking Feature - Architectural Decisions

## Overview

This document captures all architectural decisions made for the debt tracking feature based on comprehensive feedback and analysis. These decisions prioritize data integrity, offline-first conflict resolution, and alignment with the existing event-sourcing architecture.

## Critical Architectural Decisions

### 1. Balance Source of Truth - DERIVED FROM PAYMENTS

**Decision**: Remove `current_balance_cents` from debt tables. Calculate balance on read from payment history.

**Implementation**:

```typescript
// Balance calculation (not stored)
async function getDebtBalance(debtId: string): Promise<number> {
  const debt = await db.debts.get(debtId);
  const payments = await db.debtPayments.where("debt_id").equals(debtId).toArray();

  const totalPaid = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  return debt.original_amount_cents - totalPaid;
}
```

**Rationale**:

- **Conflict-free**: Payments are append-only with idempotency keys, no LWW balance drift
- **Event sourcing aligned**: Payments are immutable events, balance is derived state
- **Single source of truth**: Payment history is canonical
- **Always accurate**: Sum of payments always yields correct balance
- **Audit-friendly**: Can reconstruct balance at any point in time

**Trade-offs Accepted**:

- Requires aggregation query on each balance read (acceptable for MVP scale)
- Slightly more complex UI code (worth it for data integrity)

---

### 2. Transaction Lifecycle - COMPENSATING EVENTS (TRUE IMMUTABILITY)

**Decision**: Treat payments as truly immutable. Use compensating (reversal) events for edits/deletes. Never UPDATE payment records.

**Implementation**: Transactions use **soft delete** with `deleted_at` timestamp (DATABASE.md:196). The reversal mechanism ensures debt integrity is maintained, and soft deleted transactions preserve audit trails while allowing potential recovery.

**Implementation Pattern**:

**Edit Transaction**:

1. Create reversal payment with negative amount (sets `is_reversal: true`)
2. Link reversal to original via `reverses_payment_id`
3. Create new payment for new amount
4. Original payment remains unchanged in database

**Delete Transaction**:

1. Create reversal payment with negative amount FIRST (sets `is_reversal: true`)
2. Link reversal to original via `reverses_payment_id`
3. Soft delete the transaction record using `deleted_at` timestamp (DATABASE.md:196)
4. Payment records remain in database (audit trail preserved)

**Schema**:

```typescript
interface DebtPayment {
  // ... existing fields

  // Reversal tracking (immutable - set once at creation)
  is_reversal: boolean; // True if this IS a reversal payment
  reverses_payment_id?: string; // ID of payment being reversed (if this is a reversal)
  adjustment_reason?: string; // Why the reversal/adjustment occurred
}
```

**Rationale**:

- **Complete audit trail**: All payments preserved, reversals clearly marked
- **Conflict-free**: All operations are appends, no update conflicts
- **Event sourcing compliant**: Payments are truly immutable - never updated after creation
- **MVP simplicity**: Simpler than chain tracking, sufficient for audit needs
- **Accounting standard**: Matches double-entry bookkeeping (no erasures)

**Balance Calculation**:

```typescript
// Pre-compute set of reversed payment IDs for O(1) lookups
const reversedIds = new Set(
  payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id)
);

// Filter out reversal records themselves AND payments that were reversed
const validPayments = payments.filter(
  (p) =>
    !p.is_reversal && // Exclude reversal records (negative amounts)
    !reversedIds.has(p.id) // Exclude payments that were reversed
);

const totalPaid = validPayments.reduce((sum, p) => sum + p.amount_cents, 0);
const balance = debt.original_amount_cents - totalPaid;
```

**UI Consideration**:

- Payment history shows all payments with reversal indicators
- Payments that were reversed shown with strikethrough (detected by checking if another payment has `reverses_payment_id` pointing to them)
- Reversal payments (`is_reversal: true`) shown with clear linkage to original

---

### 3. Internal Debts Data Model - CATEGORY-BASED WITH TYPED REFERENCES

**Decision**: Support category-based internal debts as primary use case with typed entity references.

**New Schema**:

```typescript
interface InternalDebt {
  id: string;
  household_id: string;
  name: string;

  // Typed source (who/what is lending) - categories are primary use case
  from_type: "category" | "account" | "member"; // Extensible enum
  from_id: string; // FK to budget_categories, accounts, or profiles table
  from_display_name?: string; // Denormalized for performance

  // Typed destination (who/what is borrowing)
  to_type: "category" | "account" | "member";
  to_id: string;
  to_display_name?: string;

  original_amount_cents: number;
  // current_balance_cents removed (calculated from payments)

  // Additional metadata for category debts
  budget_month?: string; // YYYY-MM format for category budget period
  notes?: string; // Context for the borrowing

  status: "active" | "paid_off" | "archived";
  version: number; // For optimistic locking
  created_at: string;
  updated_at: string;
  closed_at?: string;
}
```

**Category Debt Use Cases**:

- Borrowing from "Groceries" budget to cover "Entertainment" overspend
- Moving funds from "Savings Goal" category to "Emergency" category
- Member borrowing from specific category allocation

**Validation Rules**:

- `from_id != to_id` when types are same (cannot borrow from self) - enforced via trigger
- Entity existence checked at creation time (runtime validation)
- Categories/accounts/members must belong to same household
- **No foreign key constraints** - uses soft references for flexibility

**Foreign Key Strategy**:

- **No FK constraints** on `from_id` and `to_id` - they are soft references
- This allows entities to be deleted without blocking debt history
- Display names are cached at creation time to preserve history
- Stale references acceptable for MVP (entity may be deleted/renamed)
- Phase B: Background job can detect orphaned references and flag them

**Rationale**:

- **Budget flexibility**: Tracks when categories "lend" to each other
- **Clear mental model**: Aligns with envelope budgeting
- **Extensible**: Can add more entity types without schema changes
- **History preservation**: Deleted entities don't break debt records
- **Performance**: Cached display names avoid complex JOINs

**MVP Scope**:

- Full support for `category`, `account`, and `member` types
- Primary use case is category-based borrowing (envelope budgeting)
- Display names cached at creation (staleness accepted)
- Runtime validation only (no FK enforcement)

---

### 4. Currency Handling - SINGLE CURRENCY APPLICATION

**Decision**: The entire application supports only ONE currency (PHP for MVP). No multi-currency support.

**Implementation**:

- Remove `currency_code` from debt tables (implicit from application config)
- All amounts are in the single application currency
- No currency conversion logic needed
- No validation needed for currency matching

**Rationale**:

- **Maximum simplicity**: No conversion complexity
- **Prevents errors**: No currency mismatch possible
- **Aligned with MVP scope**: PHP-only for initial release
- **Clear mental model**: All money values in same currency

**Future Migration Path**:

- Phase 2 can add multi-currency with proper conversion layer
- Would require adding currency fields back to all monetary tables

---

### 5. Overpayment Handling - ACCEPT-AND-TRACK WITH DEFENSE-IN-DEPTH VALIDATION

**Decision**: Accept all payments but use two-layer validation to detect and track overpayments.

**Implementation** (Defense-in-Depth):

**Layer 1 - UI Warning (Best Effort)**:

```typescript
// Frontend: Show warning but allow submission
// This is a UX improvement, not enforcement
if (paymentAmount > currentBalance && currentBalance > 0) {
  showWarning(
    `Payment of ${formatPHP(paymentAmount)} exceeds remaining balance of ${formatPHP(currentBalance)}`
  );
  // User can still proceed - warning is dismissible
}
```

**Layer 2 - Application Logic (Authoritative)**:

```typescript
// Backend/Offline: Synchronous detection BEFORE payment insert
const currentBalance = calculateBalance(debt);

// Flag as overpayment if:
// 1. Balance is already zero or negative (already overpaid), OR
// 2. Payment amount exceeds the current positive balance
const isOverpayment = currentBalance <= 0 || payment.amount_cents > currentBalance;
const overpaymentAmount = isOverpayment
  ? currentBalance > 0
    ? payment.amount_cents - currentBalance
    : payment.amount_cents
  : null;

// Insert payment with pre-calculated flags (not post-processing)
await createDebtPayment({
  amount_cents: payment.amount_cents,
  is_overpayment: isOverpayment, // Set during creation
  overpayment_amount: overpaymentAmount, // Set during creation
});

// Balance can go negative (indicates overpaid amount)
const newBalance = calculateBalance(debt); // May be negative
```

**Rationale**:

- **Offline-first compatible**: Handles multi-device scenario where Device A and Device B both pay ₱100 while offline for ₱100 debt
- **No version conflicts**: Both payments accepted and synced, both marked as overpayment
- **User flexibility**: Allows intentional overpayment (round up, pay ahead)
- **Balance clarity**: Negative balance = overpaid amount (e.g., -₱50 means ₱50 credit)
- **Eventual consistency**: Works with offline sync model without rejections

**Multi-Device Scenario Example**:

1. Debt has ₱100 remaining
2. Device A (offline): Creates ₱100 payment → local balance: ₱0
3. Device B (offline): Creates ₱100 payment → local balance: ₱0
4. Both sync to server
5. Server accepts both: total paid = ₱200, balance = -₱100
6. Both payments flagged `is_overpayment = true`
7. UI shows warning: "Overpaid by ₱100" with option to reverse one payment

---

### 6. Concurrent Payments in Offline-First Architecture

**Decision**: No optimistic locking. Use accept-and-track approach to handle concurrent payments.

**Why No Optimistic Locking**:

- Version checks would fail during offline operation (can't verify against server)
- Rejecting payments during sync creates poor UX ("Please re-enter payment")
- Offline devices can't coordinate to prevent conflicts
- Would require complex conflict resolution on sync failure

**Instead: Accept-and-Track Model**:

- All payments accepted during sync
- Idempotency keys prevent duplicate processing
- Overpayments tracked with flags for user review
- Balance can be negative (meaning overpaid)

**Conflict Prevention Through Design**:

- Payments are append-only (no UPDATE conflicts)
- Balance is derived, not stored (no balance drift)
- Idempotency keys prevent duplicate payments from same device
- Event sourcing ensures complete audit trail

**User Experience**:

- Frontend warnings guide users before submission
- Backend accepts all valid payments
- UI clearly shows overpayment status
- User can review and reverse if needed

**This eliminates version conflicts while maintaining data integrity through immutable events.**

---

### 7. Transaction Type Restrictions - EXTERNAL VS INTERNAL

**Decision**: External debts can only be paid via expenses. Internal debts allow both expenses and transfers.

**Validation Rules**:

```typescript
interface DebtTransactionRules {
  external_debt: {
    allowed_types: ["expense"];
    error_message: "External debt payments must be recorded as expenses";
  };
  internal_debt: {
    allowed_types: ["expense", "transfer"];
    error_message: "Internal debt payments can be expenses or transfers";
  };
}
```

**Transfer Handling for Internal Debts**: Debt-linked transfers still receive `transfer_group_id` for transaction pairing integrity. They are automatically excluded from spending reports via the existing `WHERE transfer_group_id IS NULL` pattern. The `internal_debt_id` field provides additional debt payment tracking (linked only on the expense side of the transfer).

**Key Architectural Context**: External debts are **reference tracking only** - a way to monitor "I owe $X, I've paid $Y, still owe $Z" without requiring every related transaction to be linked. Linking expense transactions to debts is optional and helps derive balances automatically, but is not mandatory. This keeps the feature lightweight and non-invasive.

**Rationale**:

- **Conceptual clarity**: External debts represent obligations to entities outside the household (expenses leaving the system)
- **Prevents modeling confusion**: External debts are not accounts - they are tracking entities
- **Simpler architecture**: No need to model external entities as liability accounts with negative balances
- **Internal flexibility**: Moving money between household accounts/categories can naturally be transfers
- **Non-invasive design**: Debt tracking doesn't force users to link every transaction
- **Natural UX**: Matches user mental model (paying a credit card company is an expense, not a transfer)

---

### 8. Debt Status State Machine - EXPLICIT TRANSITIONS

**Decision**: Implement explicit state machine with guards and automatic transitions.

**State Definitions**:

```typescript
type DebtStatus = "active" | "paid_off" | "archived";

const STATUS_TRANSITIONS = {
  active: {
    paid_off: {
      automatic: true,
      condition: "balance <= 0", // Zero or negative (overpaid)
    },
    archived: {
      automatic: false,
      condition: "manual action",
    },
  },
  paid_off: {
    active: {
      automatic: true,
      condition: "balance > 0 (reversal creates balance)",
    },
    archived: {
      automatic: false,
      condition: "manual action",
    },
  },
  archived: {
    // TERMINAL STATE in MVP
    // No transitions allowed from archived status
    // This is a one-way operation to hide completed/forgiven debts
    // Phase 2 may add unarchive functionality if business case emerges
  },
};
```

**Implementation Approach** (MVP):

- Native implementation with simple transition function
- Guards validate transitions
- Automatic checks after each payment/reversal
- Event logging for all transitions

**Future Migration Path**:

- Can migrate to XState if complexity grows
- Useful for payment schedules, interest calculations, etc.

**Rationale**:

- **Predictable behavior**: Clear rules for status changes
- **Automatic updates**: No manual intervention for paid_off
- **Audit trail**: Track all status changes
- **Flexible archival**: Support various completion scenarios

---

## Important Implementation Decisions

### 9. Transaction Type Support - REFINED WITH RESTRICTIONS

**Decision**: Allow expense and transfer based on debt type (external vs internal).

**Implementation**:

- External debts: Only `type: 'expense'` allowed
- Internal debts: Both `type: 'expense'` and `type: 'transfer'` allowed

**Rationale**:

- External debt payments are expenses to outside entities
- Internal debt payments can be transfers between accounts/categories
- Natural user mental model

**Important**: Debt-linked transfers still excluded from spending reports via `WHERE transfer_group_id IS NULL`.

---

### 10. Debt Status & Lifecycle with Temporal Validation

**Decision**: Add status field to track debt state with `closed_at` timestamp for archived debt payment validation.

**Schema**:

```typescript
interface Debt {
  // ... other fields
  status: "active" | "paid_off" | "archived";
  closed_at?: Date; // TIMESTAMPTZ - Set when status changes to paid_off or archived
}
```

**Business Rules**:

- Auto-set `paid_off` when calculated balance reaches 0 (sets `closed_at = now()`)
- Auto-revert to `active` if reversal creates positive balance (clears `closed_at = null`)
- Only `active` debts appear in payment dropdowns
- Archived debts hidden from main list (accessible via filter)
- Can manually archive (debt forgiveness, asset sold, etc.) (sets `closed_at = now()`)

**Archived Debt Payment Validation** (Solves Race Condition):

- **Problem**: Device goes offline, queues payment to debt. Later, user archives debt on another device. First device comes online and syncs queued payment.
- **Solution**: Context-aware validation with temporal boundary
  - **UI Context**: Blocks ALL payments to archived debts (strict)
  - **Sync Context**: Accepts payments ONLY if `payment_date <= closed_at` (temporal validation)
  - Payments dated after closure are rejected with error: "Cannot add payment to archived debt dated after closure"
  - This preserves audit trail integrity (events that occurred before archival) while preventing backdating abuse

**Rationale**:

- **Audit trail integrity**: Real events that occurred before closure should be preserved
- **Prevents backdating**: Can't add payments to archived debts after the fact
- **Clear temporal boundary**: Archive time is the cutoff
- **User-friendly**: Queued offline payments made before archival are honored
- **Predictable**: "Archived means no more activity after this point"

**Edge Case Handling**:

- If sync encounters archived debt without `closed_at`, reject with error (data integrity issue)
- If payment `created_at` timestamp differs from `payment_date`, use `payment_date` for validation (user-chosen date is canonical)

---

### 11. API Completeness for MVP

**Include in MVP**:

- `DELETE /api/debts/:id` - Soft delete with validation
- `DELETE /api/internal-debts/:id` - Same pattern

**Validation for DELETE**:

- If payments exist → Block deletion (or cascade soft-delete)
- Return clear error message

**Defer to Phase B**:

- Manual payment adjustment endpoints
- Payment reassignment endpoints
- Can work around by editing linked transaction

---

### 12. Split Transaction Support - NOT NEEDED

**Decision**: No support for splitting a single payment across multiple debts.

**Rationale**:

- Adds significant complexity
- Rare use case for household finance
- Workaround: Create separate transactions
- Not aligned with simple transaction model

---

### 13. Event Storage - UNIFIED EVENTS TABLE ✅ ALREADY COMPLETE

**Decision**: Use unified `events` table for all entity types.

**Current State**: The `events` table already exists with correct schema and constraints (DATABASE.md:228-236).

**Schema** (already deployed):

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,

  -- Entity tracking
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'transaction', 'account', 'category', 'budget',
    'debt', 'internal_debt', 'debt_payment'  -- Debt types already included
  )),
  entity_id UUID NOT NULL,

  -- Event details
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')),
  payload JSONB NOT NULL,

  -- Idempotency and versioning
  idempotency_key TEXT UNIQUE NOT NULL,
  event_version INT DEFAULT 1,

  -- Tracking
  actor_user_id UUID REFERENCES profiles(id),
  device_id TEXT NOT NULL,

  -- Vector clock for conflict resolution
  lamport_clock BIGINT NOT NULL,
  vector_clock JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Action Required**: ✅ **None** - Table exists with correct name and debt entity types in CHECK constraint.

**Rationale**:

- **Single schema to maintain**: One event table for all features
- **Consistent event structure**: All events follow same pattern
- **Future-proof**: New entity types only require constraint update
- **Query flexibility**: Can query all events or filter by type

---

### 14. Internal Debt Visibility - HOUSEHOLD ONLY

**Decision**: Internal debts are household-visible only for MVP. No personal visibility option.

**Implementation**:

```typescript
// Internal debts don't have owner_user_id or visibility fields
interface InternalDebt {
  household_id: string;
  // No owner_user_id
  // No visibility field
  // All household members can view/manage
}
```

**Rationale**:

- **MVP simplicity**: Reduces complexity for initial release
- **Consistent model**: All internal debts shared within household
- **Clear mental model**: Household finances are shared
- **Future extensibility**: Can add personal internal debts in Phase B

---

### 15. Transaction Deletion - CREATE REVERSAL PAYMENT

**Decision**: When a transaction is deleted, create a reversal payment to maintain debt balance integrity, then soft delete the transaction.

**Current Reality**: Transactions use **soft delete** via `deleted_at` timestamp (DATABASE.md:196).

**Implementation**:

```sql
-- Transactions table with soft delete support
CREATE TABLE transactions (
  -- ... other fields
  deleted_at TIMESTAMPTZ,  -- Soft delete timestamp (null = active)
  -- ...
);

-- NO CASCADE on debt_payments foreign key
CREATE TABLE debt_payments (
  -- ...
  transaction_id UUID NOT NULL
    REFERENCES transactions(id),  -- No ON DELETE CASCADE
  -- ...
);
```

```typescript
// Application handles deletion with reversal
async function deleteTransaction(transactionId: string) {
  const transaction = await db.transactions.get(transactionId);

  // If transaction has debt payment, create reversal FIRST
  if (transaction.debt_id || transaction.internal_debt_id) {
    await createReversalPayment(transaction, "Transaction deleted");
  }

  // Soft delete transaction (set deleted_at timestamp)
  await db.transactions.update(transactionId, {
    deleted_at: new Date().toISOString(),
  });
}
```

**Rationale**:

- **Immutable history**: All payments preserved in database
- **Audit trail**: Can see when and why transactions were deleted
- **Event sourcing aligned**: Deletions become events, not removals
- **Balance accuracy**: Reversal correctly adjusts debt balance
- **Debugging**: Can trace full history including deletions
- **Recoverable**: Soft deleted transactions can be restored if needed

**Trade-offs**:

- Slightly more complex: Requires reversal creation logic
- More records: Reversals stored plus soft deleted transactions
- **Worth it**: Complete audit trail, data integrity, and recoverability

**Soft Delete Benefits**:

- Transactions remain in database with `deleted_at` set
- Payment history remains intact via reversal mechanism
- FK references don't break (transaction still exists)
- Aligns with event sourcing principles (events are immutable)
- Application logic must handle reversal creation before soft delete

---

### 16. Display Name Strategy - CACHE WITH STALENESS ACCEPTED

**Decision**: Keep denormalized display names in internal_debts for performance. Accept staleness for MVP.

**Implementation**:

```sql
CREATE TABLE internal_debts (
  from_type TEXT NOT NULL,
  from_id UUID NOT NULL,
  from_display_name TEXT,  -- Cached at creation time
  to_type TEXT NOT NULL,
  to_id UUID NOT NULL,
  to_display_name TEXT,    -- Cached at creation time
);
```

**Rationale**:

- **Performance**: Avoids complex multi-table JOINs for listings
- **Simple queries**: Direct SELECT without joins for basic views
- **MVP acceptable**: Name changes are rare in household context
- **Clear in UI**: Can show "Name (at time of debt creation)"

**Future Enhancement**:

- Phase B: Add background job to update cached names
- Or switch to JOINs if performance allows

---

## Bug Fixes & Technical Improvements

### 17. ✅ Internal Debt Processing - ADDRESSED

**Issue**: Implementation must handle both external and internal debt payments.

**Solution Implemented**:

```typescript
async function processDebtPayment(transaction: Transaction, data: TransactionFormData) {
  // Handle external debts
  if (data.debt_id) {
    const payment = await createDebtPayment({
      debt_id: data.debt_id,
      transaction_id: transaction.id,
      amount_cents: transaction.amount_cents,
      payment_date: transaction.date,
    });

    // Update debt status based on new balance
    await updateDebtStatusFromBalance(data.debt_id, "external");
  }

  // Handle internal debts
  if (data.internal_debt_id) {
    const payment = await createDebtPayment({
      internal_debt_id: data.internal_debt_id,
      transaction_id: transaction.id,
      amount_cents: transaction.amount_cents,
      payment_date: transaction.date,
    });

    // Update debt status based on new balance
    await updateDebtStatusFromBalance(data.internal_debt_id, "internal");
  }
}
```

**Status**: ✅ Documented and ready for implementation

---

### 18. Idempotency Key Persistence

**Decision**: Store lamport clock in IndexedDB meta table with standardized key format. Sync max clock from server on device initialization.

**Implementation**:

```typescript
// Initialize device with server's max lamport clock
async function initializeDevice(deviceId: string) {
  // Fetch max lamport clock from server for this device
  const maxClock = await supabase.rpc("get_max_lamport_clock", { device_id: deviceId });

  // Set local clock to max(local, server) to prevent collisions
  const localMeta = await db.meta.get("lamport_clock");
  const localClock = localMeta?.value || 0;
  const startClock = Math.max(localClock, maxClock || 0);

  await db.meta.put({ key: "lamport_clock", value: startClock });
}

// Persistent monotonic counter
async function getNextLamportClock(): Promise<number> {
  const meta = await db.meta.get("lamport_clock");
  const next = (meta?.value || 0) + 1;
  await db.meta.put({ key: "lamport_clock", value: next });
  return next;
}

// Idempotency key format (standardized)
// For debts: ${deviceId}-debt-${debtId}-${lamportClock}
// For internal debts: ${deviceId}-internal_debt-${internalDebtId}-${lamportClock}
// For payments: ${deviceId}-debt_payment-${paymentId}-${lamportClock}
const idempotencyKey = `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
```

**Rationale**:

- **Prevents clock reset**: If IndexedDB cleared, device syncs with server to avoid collisions
- **Idempotency safety**: Ensures new events don't reuse old idempotency keys
- **Multi-device safe**: Each device maintains its own clock scoped by device_id
- **Recovery friendly**: Device can recover from cache clear without conflicts

---

### 19. Device ID Tracking in Debt Payments

**Decision**: Add `device_id` field to `debt_payments` table for complete audit trail.

**Schema**:

```sql
CREATE TABLE debt_payments (
  -- ... existing fields
  device_id TEXT NOT NULL,  -- Device that created this payment
  -- ...
);

CREATE INDEX idx_debt_payments_device ON debt_payments(device_id);
```

**Rationale**:

- **Consistency**: Aligns with `transactions` table which has `device_id` (DATABASE.md:192)
- **Audit trail**: Can trace which device created each payment for debugging
- **Multi-device insights**: Can identify devices with sync issues or overpayment patterns
- **Troubleshooting**: Essential for diagnosing concurrent payment scenarios
- **Event correlation**: Links payments to device events for complete trace

**Use Cases**:

```sql
-- Find all payments from a specific device
SELECT * FROM debt_payments WHERE device_id = 'device-xyz';

-- Debug concurrent overpayments
SELECT device_id, COUNT(*) as payment_count
FROM debt_payments
WHERE debt_id = 'debt-123' AND is_overpayment = true
GROUP BY device_id;

-- Audit device activity
SELECT d.name, dp.amount_cents, dp.device_id, dp.created_at
FROM debt_payments dp
JOIN debts d ON d.id = dp.debt_id
WHERE dp.device_id = 'device-abc'
ORDER BY dp.created_at DESC;
```

---

### 20. RLS Policy Optimization

**Decision**: Use function instead of subquery for better performance.

**Implementation**:

```sql
-- Create or replace reusable function (handles existing function)
CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid()
$$;

-- Use in policies
CREATE POLICY "debts_household_access" ON debts
  FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());
```

**Note**: Uses `CREATE OR REPLACE` to handle cases where the function already exists system-wide (see PRE-DEPLOYMENT.md:436).

---

### 21. Database Indexing Strategy

**Required Indexes**:

```sql
-- Payment queries with secondary sort for same-day payments
CREATE INDEX idx_debt_payments_debt_id_date
  ON debt_payments(debt_id, payment_date DESC, created_at DESC)
  WHERE debt_id IS NOT NULL;

CREATE INDEX idx_debt_payments_internal_debt_id_date
  ON debt_payments(internal_debt_id, payment_date DESC, created_at DESC)
  WHERE internal_debt_id IS NOT NULL;

CREATE INDEX idx_debt_payments_transaction_id
  ON debt_payments(transaction_id);

-- Reversed payments filter
CREATE INDEX idx_debt_payments_reversed
  ON debt_payments(reversed)
  WHERE reversed = false;

-- Debt listings
CREATE INDEX idx_debts_household_status
  ON debts(household_id, status, updated_at DESC);

CREATE INDEX idx_internal_debts_household_status
  ON internal_debts(household_id, status, updated_at DESC);

-- Internal debt entity lookups
CREATE INDEX idx_internal_debts_from
  ON internal_debts(from_type, from_id);

CREATE INDEX idx_internal_debts_to
  ON internal_debts(to_type, to_id);
```

**Rationale for Secondary Sort**:

- `payment_date` is a DATE (no time component)
- Multiple payments on same date need deterministic ordering
- `created_at` provides microsecond precision for tiebreaker
- Ensures consistent payment history display across devices

---

### 22. Transfer Analytics Pattern - EXCLUDE VIA TRANSFER_GROUP_ID

**Decision**: All debt-linked transfers receive `transfer_group_id` for transaction pairing. They are automatically excluded from spending reports using the existing `WHERE transfer_group_id IS NULL` pattern.

**Implementation**:

```typescript
// Example: Pay credit card debt from checking
const transfer = await createTransfer({
  from_account_id: "checking-123",
  to_account_id: "credit-card-456",
  amount_cents: 50000,
  debt_id: "debt-xyz", // Links to debt
});

// Creates two transactions:
// 1. Expense from checking (transfer_group_id: 'xyz', debt_id: 'debt-xyz')
// 2. Income to credit card (transfer_group_id: 'xyz', debt_id: null)

// Spending reports exclude BOTH via existing pattern:
// WHERE transfer_group_id IS NULL
```

**Rationale**:

- **Data consistency**: ALL account-to-account transfers are paired
- **Reuses existing validation**: Transfer triggers expect `transfer_group_id`
- **No special cases**: Spending report logic unchanged
- **Dual identification**: `transfer_group_id` = pairing, `debt_id` = debt tracking
- **Transfer semantics**: The field represents transaction integrity, not debt tracking

---

### 23. Sync Queue Dependency Tracking

**Decision**: **Defer explicit dependency tracking to Phase B**. MVP uses FK retry mechanism for payment ordering.

**Problem**: Debt payments created offline depend on their linked transactions existing in the database. If sync processes items by `created_at` timestamp alone, a payment might sync before its transaction, causing FK constraint violations and requiring retries.

**MVP Solution**: Use existing FK retry mechanism (30 retries, 2s intervals) defined in DATABASE.md sync_queue schema. Retries handle ordering automatically without schema changes.

**Phase B Enhancement**: Add `depends_on` field to sync queue items for explicit dependency ordering (reduces retries from expected to rare).

**Phase B Schema** (NOT in MVP):

```typescript
interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete";
  payload: any;
  status: "queued" | "syncing" | "confirmed" | "failed";
  created_at: string;

  // Phase B: Explicit dependency tracking
  depends_on?: string[]; // Array of entity IDs this item depends on
  priority?: number; // Optional priority (0 = high, 1 = normal, 2 = low)
}
```

**Phase B Implementation** (reference only):

```typescript
// When creating payment sync queue item
async function queueDebtPayment(payment: DebtPayment) {
  await db.syncQueue.add({
    entity_type: "debt_payment",
    entity_id: payment.id,
    operation: "create",
    payload: payment,
    status: "queued",
    depends_on: [payment.transaction_id], // Explicit dependency
    priority: 1, // Normal priority (after transactions)
    created_at: new Date().toISOString(),
  });
}

// Sync processor checks dependencies before processing
async function canProcessItem(item: SyncQueueItem): Promise<boolean> {
  if (!item.depends_on) return true;

  for (const depId of item.depends_on) {
    const dep = await db.syncQueue.where("entity_id").equals(depId).first();
    if (dep && dep.status !== "confirmed") {
      return false; // Dependency not yet synced
    }
  }

  return true; // All dependencies confirmed
}

// Process queue with dependency respect
async function processSyncQueue() {
  const items = await db.syncQueue.where("status").equals("queued").toArray();

  // Sort by priority then created_at
  const sorted = items.sort((a, b) => {
    if (a.priority !== b.priority) return (a.priority || 0) - (b.priority || 0);
    return a.created_at.localeCompare(b.created_at);
  });

  for (const item of sorted) {
    if (await canProcessItem(item)) {
      await syncItem(item);
    }
  }
}
```

**Phase B Rationale**:

- **Reduces retries**: FK violations become rare instead of expected
- **Faster sync**: No waiting for retry delays (2s × 30 retries = 60s max)
- **Better UX**: Payments sync immediately after their transactions
- **Explicit ordering**: Dependencies clear in code, not implicit timing assumptions
- **Scalable**: Handles large offline queues (50+ items) gracefully

**MVP Approach**: FK retry mechanism (already in DATABASE.md) is simpler and adequate for initial release. Dependency tracking adds complexity better suited for Phase B after observing real usage patterns.

---

### 24. Display Name Staleness - ACCEPT WITH UI GUIDANCE

**Decision**: Accept that cached display names in internal debts can become stale. Provide UI tooltips for clarity.

**MVP Scope**: No background job to update cached names. Staleness is acceptable and clearly communicated in UI.

**Implementation**:

```typescript
// Display name cached at creation
interface InternalDebt {
  from_display_name: string;  // "Groceries" at creation time
  to_display_name: string;    // "Entertainment" at creation time
}

// UI handling when entity renamed
function renderInternalDebt(debt: InternalDebt) {
  const currentFromName = lookupCurrentEntityName(debt.from_type, debt.from_id);
  const currentToName = lookupCurrentEntityName(debt.to_type, debt.to_id);

  // Show tooltip if names differ
  if (currentFromName !== debt.from_display_name) {
    return (
      <Tooltip content={`Originally '${debt.from_display_name}', now '${currentFromName}'`}>
        {currentFromName}
      </Tooltip>
    );
  }

  return debt.from_display_name;
}
```

**Rationale**:

- **Performance**: Avoids complex JOINs on every query
- **MVP acceptable**: Name changes are rare in household context
- **Simple queries**: Direct SELECT without joins for listings
- **Clear communication**: Tooltips provide clarity without schema changes

**MVP Limitations**:

- Display names are frozen at debt creation time
- Renaming/deleting entities does NOT update existing debt names
- Users see original names with tooltips explaining staleness
- This is explicitly documented in UI and user documentation
- Future Phase B: Can add nightly job to refresh cached names if usage shows need

---

## Implementation Priority

### Phase A (MVP) - Must Have

1. ✅ Fix internal debt balance bug
2. ✅ Remove stored balances → derive from payments
3. ✅ Implement typed entity references for internal debts
4. ✅ Add debt status field
5. ✅ Implement compensating events for transaction edits
6. ✅ Support transfer transactions
7. ✅ Add DELETE endpoints with validation
8. ✅ Fix idempotency key persistence
9. ✅ Add required indexes

### Phase B - Nice to Have

1. Manual payment adjustment endpoints
2. Balance reconciliation job (if we add cached balances)
3. Overpayment credit tracking
4. Payment reassignment
5. Advanced reporting

### Phase C - Future

1. Split transaction support (if ever needed)
2. Interest calculations
3. Payment schedules
4. Multi-currency (Phase 2 of app)

---

## Testing Requirements

### Unit Tests

- Balance calculation from payments
- Compensating event creation
- Transaction edit → reversal flow
- Transaction delete → reversal flow
- Overpayment validation
- Status transitions (active → paid_off)
- Idempotency key generation

### Integration Tests

- Offline payment creation + sync
- Concurrent payments from multiple devices
- Edit transaction with debt → verify reversal
- Delete transaction with debt → verify reversal
- Debt status filtering in UI

### E2E Tests

- Complete debt lifecycle (create → pay → close)
- Transfer linked to debt
- Transaction edit with debt payment
- Offline/online sync scenarios

---

## Migration Notes

### Database Migration

1. Remove `current_balance_cents` columns
2. Add status fields to debt tables
3. Update internal_debts with typed references
4. Add reversal fields to debt_payments
5. Create required indexes
6. Create RLS optimization function

### Dexie Migration

1. Increment version number appropriately
2. Remove balance fields from schema
3. Add status to debt stores
4. Add meta table if not exists
5. Initialize lamport_clock in meta

### Data Migration (if existing debts)

1. Calculate current balances from payments
2. Set all existing debts to status = "active"
3. Mark fully paid debts as "paid_off"
4. Migrate string references to typed (if any exist)

---

## Summary

These decisions prioritize:

1. **Data integrity** over convenience
2. **Conflict-free operations** over simplicity
3. **Audit trails** over storage efficiency
4. **Event sourcing alignment** over traditional CRUD
5. **MVP simplicity** over feature completeness

The architecture ensures the debt tracking feature integrates seamlessly with the offline-first, event-sourced foundation while preventing the subtle bugs that emerge from multi-device synchronization.
