# Debt Feature Technical Implementation

## Architecture Integration

The debt feature integrates with the existing three-layer state architecture:

```
Zustand (UI State) → IndexedDB (Persistent) → Supabase (Cloud)
```

## Core Architectural Principles

- **Derived Balances**: Current balance calculated from payment history (not stored)
- **Immutable Events**: Payments are append-only with compensating reversals for edits
- **Single Currency**: Application supports only PHP, no currency fields needed
- **Typed References**: Internal debts use explicit entity type + ID references

## Event Sourcing

### Event Types

Each debt operation generates an event for the unified audit trail:

```typescript
// Events use the unified 'events' table, not 'transaction_events'
// Debt events
{
  entity_type: "debt" | "internal_debt",  // Added to events table CHECK constraint
  entity_id: debtId,
  op: "create" | "update" | "delete",
  payload: {
    name?: string,
    original_amount_cents?: number,
    status?: "active" | "paid_off" | "archived",
    // Note: NO current_balance_cents (derived)
    // ... other changed fields
  }
}

// Payment events (immutable, append-only)
{
  entity_type: "debt_payment",  // Added to events table CHECK constraint
  entity_id: paymentId,
  op: "create",  // Only create, never update/delete
  payload: {
    debt_id?: string,
    internal_debt_id?: string,
    transaction_id: string,
    amount_cents: number,  // Positive for payment, negative for reversal
    payment_date: string,
    is_reversal: boolean,         // True if this IS a reversal payment (set once at creation)
    reverses_payment_id?: string, // ID of payment being reversed (if this is a reversal)
    is_overpayment?: boolean,     // Track overpayments
    overpayment_amount?: number,
    adjustment_reason?: string
  }
}
```

### Idempotency Keys with Persistent Counter

Prevent duplicate payments with monotonic counter:

```typescript
// Store counter in IndexedDB meta table
async function getNextLamportClock(): Promise<number> {
  const meta = await db.meta.get("lamport_clock");
  const next = (meta?.value || 0) + 1;
  await db.meta.put({ key: "lamport_clock", value: next });
  return next;
}

// Generate idempotency key (standardized format)
const lamportClock = await getNextLamportClock();
const idempotencyKey = `${deviceId}-debt_payment-${paymentId}-${lamportClock}`;
```

## Sync Engine Integration

### Dexie Schema Update

```typescript
// In src/lib/dexie/db.ts
// Check current version before incrementing
const NEXT_VERSION = this.verno + 1;

this.version(NEXT_VERSION)
  .stores({
    // ... existing tables ...

    // NEW: Debt tables (no balance fields - derived from payments)
    debts: "id, household_id, status, created_at, closed_at",
    internalDebts:
      "id, household_id, from_type, from_id, to_type, to_id, status, created_at, closed_at",
    debtPayments: "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal",

    // Add meta table if not exists (for lamport clock)
    meta: "key",
  })
  .upgrade(async (tx) => {
    console.log(`[Dexie Migration v${NEXT_VERSION}] Adding debt tracking tables`);

    // Initialize lamport clock
    const meta = tx.table("meta");
    await meta.put({ key: "lamport_clock", value: 0 });

    return Promise.resolve();
  });
```

### TypeScript Interfaces

```typescript
// In src/types/debt.ts
export interface Debt {
  id: string;
  household_id: string;
  name: string;
  original_amount_cents: number;
  // NO current_balance_cents - calculated from payments
  status: "active" | "paid_off" | "archived";
  created_at: string;
  updated_at: string;
  closed_at?: string; // When status became paid_off or archived
}

export interface InternalDebt {
  id: string;
  household_id: string;
  name: string;

  // Typed source entity (who/what is lending)
  from_type: "category" | "account" | "member";
  from_id: string; // Soft reference to budget_categories, accounts, or profiles
  from_display_name: string; // Cached at creation time for performance

  // Typed destination entity (who/what is borrowing)
  to_type: "category" | "account" | "member";
  to_id: string; // Soft reference to budget_categories, accounts, or profiles
  to_display_name: string; // Cached at creation time for performance

  original_amount_cents: number;
  // NO current_balance_cents - calculated from payments
  status: "active" | "paid_off" | "archived";
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface DebtPayment {
  id: string;
  household_id: string;
  debt_id?: string; // Either debt_id OR internal_debt_id
  internal_debt_id?: string;
  transaction_id: string;
  amount_cents: number; // Positive for payment, negative for reversal
  payment_date: string; // DATE type (user's local date)
  device_id: string; // Device that created this payment (for audit trail)

  // Reversal tracking (immutable - set once at creation, never updated)
  is_reversal: boolean; // True if this IS a reversal payment
  reverses_payment_id?: string; // ID of payment being reversed (if this is a reversal)
  adjustment_reason?: string; // Why reversal/adjustment occurred

  // Overpayment tracking
  is_overpayment?: boolean; // True if payment exceeded remaining balance
  overpayment_amount?: number; // Amount that exceeded balance

  created_at: string; // TIMESTAMPTZ (UTC) - used for event ordering
}

// Helper type for balance calculation
export interface DebtWithBalance extends Debt {
  current_balance_cents: number; // Calculated field, not stored
}
```

## Conflict Resolution

Conflict-free design through append-only operations:

```typescript
// In conflict resolver
case "debt":
case "internal_debt":
  // Only metadata uses LWW (name, status)
  // Balance is derived, not stored, so no conflicts
  return remoteTimestamp > localTimestamp ? remoteValue : localValue;

case "debt_payment":
  // Payments are immutable and append-only
  // Idempotency key prevents duplicates
  // No updates or deletes, only creates
  return localValue;  // Keep local, idempotency prevents dupes
```

**Key Design**: Balances are never stored, always calculated from payments. This eliminates balance drift from concurrent updates.

## Transaction Integration

### Transaction Creation with Debt Payment

```typescript
// In src/lib/offline/transactions.ts
export async function createOfflineTransaction(data: TransactionFormData) {
  // 1. Check for overpayment (accept but track) - DEFENSE-IN-DEPTH LAYER 2
  // TIMING: Overpayment detection happens synchronously BEFORE payment insert
  // This is the authoritative check (Layer 2), following the UI warning (Layer 1)
  // Benefits:
  // - Immediate flagging (no post-processing batch jobs needed)
  // - Avoids race conditions between balance check and insert
  // - Enables payment INSERT to include pre-calculated is_overpayment flags
  // - Works offline without server round-trip
  let isOverpayment = false;
  let overpaymentAmount = null;

  if (data.debt_id || data.internal_debt_id) {
    const currentBalance = await calculateDebtBalance(
      data.debt_id || data.internal_debt_id,
      data.internal_debt_id ? "internal" : "external"
    );

    // Accept overpayments but track them
    // Flag if balance is already <= 0 OR payment exceeds positive balance
    isOverpayment = currentBalance <= 0 || data.amount_cents > currentBalance;
    if (isOverpayment) {
      overpaymentAmount =
        currentBalance > 0 ? data.amount_cents - currentBalance : data.amount_cents;
      // Frontend should have already warned the user
      console.warn(
        `Overpayment detected: Payment of ${formatPHP(data.amount_cents)} exceeds balance of ${formatPHP(currentBalance)}`
      );
    }
  }

  // 2. Create transaction (expense or transfer)
  const transaction = await createTransaction(data);

  // 3. Process debt payment if linked
  if (data.debt_id || data.internal_debt_id) {
    await processDebtPayment(transaction, data, isOverpayment, overpaymentAmount);
  }

  // 4. Generate events
  await generateTransactionEvent(transaction);

  return transaction;
}

async function processDebtPayment(
  transaction: Transaction,
  data: TransactionFormData,
  isOverpayment: boolean = false,
  overpaymentAmount: number | null = null
) {
  // NOTE: Client-side overpayment detection happens BEFORE calling this function
  // (see lines 208-227 above). Server-side validation is ALSO enforced via
  // database trigger for defense-in-depth:
  // 1. Trigger recalculates debt balance from payment history before INSERT
  // 2. Detects overpayment independently (balance <= 0 OR payment > balance)
  // 3. Sets is_overpayment and overpayment_amount flags automatically
  // This prevents malicious clients from bypassing application-layer validation.
  // See database migration section for trigger implementation (lines 1980-2010)

  // Create payment record with idempotency key
  const lamportClock = await getNextLamportClock();
  const payment: DebtPayment = {
    id: nanoid(),
    household_id: transaction.household_id,
    debt_id: data.debt_id,
    internal_debt_id: data.internal_debt_id,
    transaction_id: transaction.id,
    amount_cents: transaction.amount_cents,
    payment_date: transaction.date,
    is_overpayment: isOverpayment,
    overpayment_amount: overpaymentAmount,
    created_at: new Date().toISOString(),
  };

  // Store in IndexedDB
  await db.debtPayments.add(payment);

  // Check if balance is now zero and update status
  const newBalance = await calculateDebtBalance(
    data.debt_id || data.internal_debt_id,
    data.internal_debt_id ? "internal" : "external"
  );

  if (newBalance === 0) {
    // Update debt status to paid_off
    const table = data.debt_id ? db.debts : db.internalDebts;
    const debtId = data.debt_id || data.internal_debt_id;

    await table.update(debtId, {
      status: "paid_off",
      closed_at: new Date().toISOString(),
    });
  }

  // Queue for sync with idempotency key
  // CRITICAL: Use payment.id (entity ID), NOT transaction.id
  // This ensures unique keys even if same transaction links to multiple debts
  await queueDebtPaymentSync(payment, `${deviceId}-debt_payment-${payment.id}-${lamportClock}`);
}

// CRITICAL: Calculate balance from payment history
// Can return negative (negative balance = overpaid amount)
async function calculateDebtBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<number> {
  const debt =
    type === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);

  if (!debt) return 0;

  // Get all payments for this debt
  const payments = await db.debtPayments
    .where(type === "external" ? "debt_id" : "internal_debt_id")
    .equals(debtId)
    .toArray();

  // Pre-compute set of reversed payment IDs for O(1) lookups
  const reversedIds = new Set(
    payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id)
  );

  // Filter out reversal records AND payments that were reversed
  const validPayments = payments.filter(
    (p) =>
      !p.is_reversal && // Exclude reversal records (negative amounts)
      !reversedIds.has(p.id) // Exclude payments that were reversed
  );

  // Sum all valid payments
  const totalPaid = validPayments.reduce((sum, p) => sum + p.amount_cents, 0);

  // Allow negative balance (negative = overpaid amount)
  // Example: original ₱100, paid ₱150 → balance = -₱50 (overpaid by ₱50)
  return debt.original_amount_cents - totalPaid;
}

// Update debt status based on current balance
async function updateDebtStatusFromBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<void> {
  const balance = await calculateDebtBalance(debtId, type);
  const table = type === "external" ? db.debts : db.internalDebts;

  const debt = await table.get(debtId);
  if (!debt) return;

  // Update status based on balance
  if (balance <= 0 && debt.status !== "paid_off" && debt.status !== "archived") {
    // Balance is zero or negative (overpaid), mark as paid off
    // Do not auto-update archived debts
    await table.update(debtId, {
      status: "paid_off",
      closed_at: new Date().toISOString(),
    });
  } else if (balance > 0 && debt.status === "paid_off") {
    // Balance is positive (reversal occurred), reactivate
    await table.update(debtId, {
      status: "active",
      closed_at: null,
    });
  }
}
```

### Transaction Edit/Delete Handling

```typescript
// When transaction is edited
export async function editOfflineTransaction(
  oldTransaction: Transaction,
  newData: TransactionFormData
) {
  // Handle debt payment changes
  if (oldTransaction.debt_id || oldTransaction.internal_debt_id) {
    await createReversalPayment(oldTransaction, "Transaction edited");
  }

  // Create new transaction
  const newTransaction = await createTransaction(newData);

  // Create new payment if still linked to debt
  if (newData.debt_id || newData.internal_debt_id) {
    await processDebtPayment(newTransaction, newData);
  }

  return newTransaction;
}

// When transaction is deleted
export async function deleteOfflineTransaction(transaction: Transaction) {
  // Create reversal if debt payment exists
  if (transaction.debt_id || transaction.internal_debt_id) {
    await createReversalPayment(transaction, "Transaction deleted");
  }

  // Soft delete transaction (DATABASE.md:196)
  // Transactions use deleted_at timestamp, not hard delete
  await db.transactions.update(transaction.id, {
    deleted_at: new Date().toISOString(),
  });
}

// Helper: Create reversal payment
async function createReversalPayment(transaction: Transaction, reason: string) {
  // Find original payment
  const originalPayment = await db.debtPayments
    .where("transaction_id")
    .equals(transaction.id)
    .first();

  // Check if payment was already reversed
  if (!originalPayment) return;

  const existingReversal = await db.debtPayments
    .where("reverses_payment_id")
    .equals(originalPayment.id)
    .first();

  if (existingReversal) return; // Already reversed

  // Create reversal payment (truly immutable - no UPDATE operations)
  const lamportClock = await getNextLamportClock();
  const reversal: DebtPayment = {
    id: nanoid(),
    household_id: transaction.household_id,
    debt_id: originalPayment.debt_id,
    internal_debt_id: originalPayment.internal_debt_id,
    transaction_id: transaction.id,
    amount_cents: -originalPayment.amount_cents, // Negative for reversal
    payment_date: transaction.date,
    device_id: await getDeviceId(),
    is_reversal: true, // This IS a reversal payment
    reverses_payment_id: originalPayment.id, // Links to original payment
    adjustment_reason: reason,
    is_overpayment: false, // Reversals don't trigger overpayment checks
    created_at: new Date().toISOString(),
  };

  // Store reversal (append-only, no UPDATE to original payment)
  await db.debtPayments.add(reversal);

  // Check if debt needs status update (was paid_off, now has balance)
  await updateDebtStatusFromBalance(
    originalPayment.debt_id || originalPayment.internal_debt_id,
    originalPayment.internal_debt_id ? "internal" : "external"
  );

  // Queue for sync
  // CRITICAL: Use reversal.id (entity ID), NOT transaction.id
  await queueDebtPaymentSync(reversal, `${deviceId}-debt_payment-${reversal.id}-${lamportClock}`);
}
```

## RLS Policies

```sql
-- Optimization: Create reusable function for better performance
-- Using CREATE OR REPLACE to handle cases where function already exists
CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid()
$$;

-- Create index for efficient lookup
CREATE INDEX idx_profiles_id_household ON profiles(id, household_id);

-- Debts table policies
CREATE POLICY "debts_household_access"
  ON debts FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

-- Internal debts policies
CREATE POLICY "internal_debts_household_access"
  ON internal_debts FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

-- Debt payments policies
CREATE POLICY "debt_payments_household_access"
  ON debt_payments FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

-- Events table policies (apply to debt entity types)
-- Note: Events table already has RLS policies (RLS-POLICIES.md:210-237)
-- These policies automatically apply to debt events since entity_type includes:
-- 'debt', 'internal_debt', 'debt_payment'
CREATE POLICY "events_select" ON events
  FOR SELECT TO authenticated
  USING (household_id = get_user_household_id());

CREATE POLICY "events_insert" ON events
  FOR INSERT TO authenticated
  WITH CHECK (
    household_id = get_user_household_id()
    AND actor_user_id = auth.uid()
  );
-- Events are immutable (no UPDATE/DELETE policies)

-- Sync queue policies (apply to debt sync operations)
-- Note: Sync queue already has RLS policies (RLS-POLICIES.md:280-327)
-- These policies automatically apply to debt sync items
CREATE POLICY "sync_queue_select" ON sync_queue
  FOR SELECT TO authenticated
  USING (
    device_id IN (
      SELECT id FROM devices WHERE user_id = auth.uid()
    )
  );

-- Similar policies for INSERT, UPDATE, DELETE on sync_queue
-- See RLS-POLICIES.md for complete policy definitions

-- Transactions table policies (with debt linkage)
-- Note: Existing transaction RLS policies (RLS-POLICIES.md:152-205)
-- already handle debt_id and internal_debt_id fields via household_id isolation
-- No additional policies needed for debt-linked transactions
```

## Database Indexes

```sql
-- Payment queries with secondary sort for same-day payments
-- Includes ID as final tie-breaker for microsecond collision edge cases
CREATE INDEX idx_debt_payments_debt_id_date
  ON debt_payments(debt_id, payment_date DESC, created_at DESC, id)
  WHERE debt_id IS NOT NULL;

CREATE INDEX idx_debt_payments_internal_debt_id_date
  ON debt_payments(internal_debt_id, payment_date DESC, created_at DESC, id)
  WHERE internal_debt_id IS NOT NULL;

CREATE INDEX idx_debt_payments_transaction_id
  ON debt_payments(transaction_id);

-- Index for reversal lookups (finding reversals that point to a payment)
CREATE INDEX idx_debt_payments_reverses_payment_id
  ON debt_payments(reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;  -- Optimizes reversal detection

-- Optional: Partial index for balance calculations (non-reversal payments)
CREATE INDEX idx_debt_payments_is_reversal
  ON debt_payments(is_reversal)
  WHERE is_reversal = false;  -- Most queries want actual payments, not reversals

-- Overpayment query indexes (for dashboard aggregations and audit reports)
CREATE INDEX idx_debt_payments_overpayment
  ON debt_payments(debt_id, is_overpayment)
  WHERE is_overpayment = true;

CREATE INDEX idx_debt_payments_internal_overpayment
  ON debt_payments(internal_debt_id, is_overpayment)
  WHERE is_overpayment = true;

-- Device audit index (for debugging concurrent payment scenarios)
CREATE INDEX idx_debt_payments_device
  ON debt_payments(device_id, created_at DESC)

-- Debt listing queries
CREATE INDEX idx_debts_household_status
  ON debts(household_id, status, updated_at DESC);

CREATE INDEX idx_internal_debts_household_status
  ON internal_debts(household_id, status, updated_at DESC);

-- Internal debt entity references
CREATE INDEX idx_internal_debts_from
  ON internal_debts(from_type, from_id);

CREATE INDEX idx_internal_debts_to
  ON internal_debts(to_type, to_id);

-- Transactions table debt lookups (NEW - for debt feature)
CREATE INDEX idx_transactions_debt_id
  ON transactions(debt_id)
  WHERE debt_id IS NOT NULL;

CREATE INDEX idx_transactions_internal_debt_id
  ON transactions(internal_debt_id)
  WHERE internal_debt_id IS NOT NULL;

-- NOTE: No separate events index needed for debt entity types
-- The existing idx_events_entity index (DATABASE.md:258-267) already covers
-- (entity_type, entity_id, lamport_clock) which efficiently handles debt queries
-- Partial index with WHERE clause would only save ~43% space (3 of 7 entity types)
-- which doesn't justify the maintenance overhead for MVP

-- Sync queue debt operations filtering (NEW - for debt feature)
CREATE INDEX idx_sync_queue_debt_operations
  ON sync_queue(entity_type, status)
  WHERE entity_type IN ('debt', 'internal_debt', 'debt_payment');
```

## API Endpoints & Supabase Functions

### REST API Endpoints

All endpoints follow RLS policies - household_id automatically filtered via `get_user_household_id()`.

```typescript
// Debt Management
GET    /api/debts?status=active         // List debts with optional status filter
POST   /api/debts                       // Create new external debt
PATCH  /api/debts/:id                   // Update debt (name, status only)
DELETE /api/debts/:id                   // Soft delete (validates no payments exist)

GET    /api/internal-debts?status=active
POST   /api/internal-debts
PATCH  /api/internal-debts/:id
DELETE /api/internal-debts/:id

// Payment History
GET    /api/debt-payments?debt_id=:id           // Get all payments for external debt
GET    /api/debt-payments?internal_debt_id=:id  // Get all payments for internal debt
```

### Supabase RPC Functions

```sql
-- Get debt with calculated balance
CREATE OR REPLACE FUNCTION get_debt_with_balance(debt_uuid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  original_amount_cents BIGINT,
  current_balance_cents BIGINT,  -- Calculated
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.original_amount_cents,
    (d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)) AS current_balance_cents,
    d.status,
    d.created_at,
    d.updated_at
  FROM debts d
  LEFT JOIN debt_payments dp ON dp.debt_id = d.id
    AND dp.is_reversal = false  -- Exclude reversal records
    AND dp.id NOT IN (  -- Exclude payments that were reversed
      SELECT reverses_payment_id
      FROM debt_payments
      WHERE reverses_payment_id IS NOT NULL
    )
  WHERE d.id = debt_uuid
    AND d.household_id = get_user_household_id()
  GROUP BY d.id;
END;
$$;

-- List all debts with balances
CREATE OR REPLACE FUNCTION list_debts_with_balances(status_filter TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  original_amount_cents BIGINT,
  current_balance_cents BIGINT,
  status TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.original_amount_cents,
    (d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)) AS current_balance_cents,
    d.status,
    d.updated_at
  FROM debts d
  LEFT JOIN debt_payments dp ON dp.debt_id = d.id
    AND dp.is_reversal = false  -- Exclude reversal records
    AND dp.id NOT IN (  -- Exclude payments that were reversed
      SELECT reverses_payment_id
      FROM debt_payments
      WHERE reverses_payment_id IS NOT NULL
    )
  WHERE d.household_id = get_user_household_id()
    AND (status_filter IS NULL OR d.status = status_filter)
  GROUP BY d.id
  ORDER BY d.updated_at DESC;
END;
$$;

-- Validate debt deletion (no payments exist)
CREATE OR REPLACE FUNCTION can_delete_debt(debt_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  payment_count INT;
BEGIN
  SELECT COUNT(*) INTO payment_count
  FROM debt_payments
  WHERE debt_id = debt_uuid
    AND household_id = get_user_household_id();

  RETURN payment_count = 0;
END;
$$;
```

### Error Response Format

```typescript
interface ApiError {
  error: string;
  code: string;
  details?: any;
}

// Examples
{
  "error": "Cannot delete debt with payment history",
  "code": "DEBT_HAS_PAYMENTS",
  "details": { "payment_count": 5 }
}

{
  "error": "Payment exceeds remaining balance",
  "code": "OVERPAYMENT_WARNING",  // Note: warning, not error
  "details": {
    "balance": 10000,
    "payment": 15000,
    "overpayment": 5000
  }
}
```

## Sync Queue Integration

Debt entities integrate with the existing `sync_queue` table and sync engine.

### Sync Queue Schema

```typescript
// Complete sync_queue table schema (DATABASE.md:302-323)
// Used for all entity types including debts
interface SyncQueueItem {
  id: string; // UUID primary key
  household_id: string; // Household isolation
  entity_type:
    | "transaction"
    | "account"
    | "category"
    | "budget"
    | "debt"
    | "internal_debt"
    | "debt_payment"; // Debt types added
  entity_id: string; // UUID of the entity being synced
  operation: any; // JSONB - full operation payload
  device_id: string; // Which device created this sync item
  status: "queued" | "syncing" | "completed" | "failed"; // Sync state
  retry_count: number; // Number of retry attempts (default 0)
  error_message?: string; // Error details if status = 'failed'
  created_at: string; // When queued (TIMESTAMPTZ)
  updated_at: string; // Last status change (TIMESTAMPTZ)

  // Explicit dependency tracking (optional)
  depends_on?: string[]; // Array of entity IDs this item depends on
  priority?: number; // Optional priority (0=high, 1=normal, 2=low)

  // Note: depends_on provides explicit ordering (debt payments depend on transactions)
  // Fallback: retry mechanism handles remaining FK violations
}

// Indexes for efficient sync queue processing (DATABASE.md:302-323)
// - idx_sync_queue_status ON (status)
// - idx_sync_queue_device ON (device_id)
// - idx_sync_queue_created ON (created_at)
```

### Debt Event Structure

```typescript
// Debt creation event
{
  entity_type: "debt",
  entity_id: "debt-123",
  operation: "create",
  payload: {
    name: "Car Loan",
    original_amount_cents: 500000,
    status: "active"
  },
  idempotency_key: "device-abc-debt-debt-123-1"
}

// Debt payment event (most critical)
{
  entity_type: "debt_payment",
  entity_id: "payment-456",
  operation: "create",  // Only create, never update
  payload: {
    debt_id: "debt-123",
    transaction_id: "txn-789",
    amount_cents: 50000,
    payment_date: "2025-01-05",
    is_overpayment: false,
    overpayment_amount: null
  },
  idempotency_key: "device-abc-debt_payment-txn-789-5"  // Includes transaction ID
}

// Reversal payment event
{
  entity_type: "debt_payment",
  entity_id: "payment-999",
  operation: "create",
  payload: {
    debt_id: "debt-123",
    transaction_id: "txn-789",
    amount_cents: -50000,  // Negative for reversal
    payment_date: "2025-01-05",
    is_reversal: true,  // This IS a reversal payment (set once at creation)
    reverses_payment_id: "payment-456",  // Links to original payment
    adjustment_reason: "Transaction deleted"
  },
  idempotency_key: "device-abc-debt_payment-txn-789-6"
}
```

### Sync Processing

```typescript
// Sync processor handles all entity types
async function processSyncQueue() {
  const items = await db.syncQueue.where("status").equals("queued").sortBy("created_at");

  for (const item of items) {
    try {
      switch (item.entity_type) {
        case "debt":
        case "internal_debt":
          await syncDebt(item);
          break;

        case "debt_payment":
          await syncDebtPayment(item);
          break;

        // ... other entity types
      }
    } catch (error) {
      await handleSyncError(item, error);
    }
  }
}

async function syncDebtPayment(item: SyncQueueItem) {
  // Check idempotency
  const exists = await supabase
    .from("events")
    .select("id")
    .eq("idempotency_key", item.idempotency_key)
    .single();

  if (exists.data) {
    // Already processed, mark as confirmed
    await markItemConfirmed(item.id);
    return;
  }

  // Insert payment (server will validate and process)
  const { data, error } = await supabase.from("debt_payments").insert(item.payload);

  if (error) {
    if (error.code === "DEBT_NOT_FOUND") {
      // Debt hasn't synced yet, retry later
      await requeueItem(item);
    } else if (error.code === "23503" || error.message?.includes("transaction_id")) {
      // FK constraint violation: Transaction hasn't synced yet, retry later
      await requeueItem(item);
    } else {
      throw error;
    }
  } else {
    // Create event record
    await createEvent({
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      operation: item.operation,
      payload: item.payload,
      idempotency_key: item.idempotency_key,
    });

    await markItemConfirmed(item.id);
  }
}
```

### Merge Strategy with Transaction Events

Debt payments are linked to transactions, so sync order matters:

```typescript
// Transaction creation with debt payment creates TWO sync items
async function createTransactionWithDebt(data: TransactionFormData) {
  // 1. Create transaction
  const transaction = await db.transactions.add(data);

  // 2. Queue transaction sync
  await db.syncQueue.add({
    entity_type: "transaction",
    entity_id: transaction.id,
    operation: "create",
    payload: transaction,
    idempotency_key: `${deviceId}-transaction-${transaction.id}-${lamportClock}`,
    status: "queued",
  });

  // 3. If debt linked, queue payment sync
  if (data.debt_id || data.internal_debt_id) {
    const payment = await createDebtPayment({
      transaction_id: transaction.id,
      debt_id: data.debt_id,
      internal_debt_id: data.internal_debt_id,
      amount_cents: data.amount_cents,
      payment_date: data.date,
    });

    await db.syncQueue.add({
      entity_type: "debt_payment",
      entity_id: payment.id,
      operation: "create",
      payload: payment,
      idempotency_key: `${deviceId}-debt_payment-${payment.id}-${lamportClock + 1}`,
      status: "queued",
      // Note: No depends_on field - sync order handled by idempotency
    });
  }
}
```

**Sync Order Note**: Transaction and payment events sync independently. The server handles missing transaction references via idempotency checks and retry logic. If a payment arrives before its transaction, it's retried later.

### Sync Dependency Strategy

**Problem**: Debt payments reference transactions via FK constraint. If payment syncs before its transaction, sync fails.

**Solution**: Idempotency-based retry with exponential backoff (no explicit dependency graph).

**Retry Configuration**:

```typescript
// Sync retry configuration for debt payments
const DEBT_SYNC_CONFIG = {
  // General network/timeout retries
  maxRetries: 3,
  retryDelayMs: [1000, 5000, 15000], // Exponential backoff: 1s, 5s, 15s

  // FK constraint violation retries (transaction not synced yet)
  fkViolationRetryLimit: 30, // High limit for large offline queues (60s max wait)
  fkViolationRetryInterval: 2000, // 2 second intervals (faster than network retries)

  // Failure handling after max retries
  onMaxRetriesExceeded: (item: SyncQueueItem) => {
    // Mark as failed for manual review
    updateSyncQueueStatus(item.id, "failed");
    notifyUser({
      severity: "warning",
      message: "Some changes failed to sync. Will retry when online.",
      action: "VIEW_SYNC_QUEUE",
    });
  },
};
```

**Implementation**:

1. **Queue Independently**: Transaction and payment queued as separate sync items
2. **Sync in Order**: Process queue by `created_at` ASC (natural ordering)
3. **FK Failure Handling**: If payment sync fails due to missing transaction:
   - Check error code: `23503` (foreign key violation) or message contains `transaction_id`
   - Requeue payment with status='queued' (retry later)
   - Continue processing other queue items
4. **Retry with Backoff**: Payment retried on next sync cycle (automatic)
5. **Idempotency Protection**: If transaction syncs multiple times, idempotency key prevents duplicates

**Example Flow**:

```
Time T0: User creates transaction + payment offline
  - Queue: [{ entity: txn-123, status: queued }, { entity: pay-456, status: queued }]

Time T1: Sync cycle starts
  - Process txn-123: SUCCESS → creates transaction in DB
  - Process pay-456: SUCCESS → creates payment (FK to txn-123 exists)

Time T2 (edge case): Payment syncs first (out of order due to retry)
  - Process pay-456: FAIL (FK constraint - txn-123 not in DB yet)
  - Requeue pay-456 with status='queued'
  - Process txn-123: SUCCESS
  - Next sync cycle: Process pay-456: SUCCESS (txn-123 now exists)
```

**Trade-offs**:

- ✅ **Simpler**: No complex dependency graph to maintain
- ✅ **Resilient**: Retry mechanism handles any ordering issues
- ❌ **Slower**: Failed payments require additional sync cycle
- ✅ **Acceptable**: MVP scale makes this negligible (< 1 second delay)

**Alternative Considered** (Rejected for MVP):

- Explicit `depends_on` field in sync queue
- Topological sort before syncing
- Complexity not justified for MVP scale

## Error Handling Patterns

### Network & Sync Errors

**1. Network Timeout During Payment Sync**:

```typescript
async function syncDebtPayment(payment: DebtPayment, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = [1000, 5000, 15000]; // Exponential backoff

  try {
    const response = await supabase.from("debt_payments").insert(payment).timeout(10000); // 10 second timeout

    if (response.error) throw response.error;

    await markSyncItemConfirmed(payment.id);
  } catch (error) {
    if (error.code === "ETIMEDOUT" || error.code === "ENETUNREACH") {
      // Network error - retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS[retryCount]);
        return syncDebtPayment(payment, retryCount + 1);
      } else {
        // Max retries exceeded - mark as failed for manual review
        await markSyncItemFailed(payment.id, "Network timeout after 3 retries");
        notifyUser("Sync failed - will retry when online");
      }
    } else {
      throw error; // Re-throw non-network errors
    }
  }
}
```

**2. Partial Sync Failure (Transaction Synced, Payment Failed)**:

```typescript
async function syncTransactionWithPayment(txn: Transaction, payment: DebtPayment) {
  // Strategy: Queue them separately, handle FK constraint failures

  // 1. Sync transaction first
  const txnResult = await syncTransaction(txn);

  if (txnResult.error) {
    // Transaction failed - don't sync payment
    await markSyncItemFailed(payment.id, "Waiting for transaction sync");
    return;
  }

  // 2. Sync payment (references transaction)
  try {
    await syncDebtPayment(payment);
  } catch (error) {
    if (error.code === "23503" || error.message?.includes("transaction_id")) {
      // FK constraint violation - transaction hasn't synced yet
      // Requeue payment for later retry
      await updateSyncQueueStatus(payment.id, "queued");
      console.log("[Sync] Payment requeued - waiting for transaction");
    } else {
      throw error;
    }
  }
}
```

**3. Idempotency Key Collision**:

```typescript
async function handleIdempotencyCollision(payment: DebtPayment) {
  // Check if event with same idempotency key already exists
  const existing = await supabase
    .from("events")
    .select("id, payload")
    .eq("idempotency_key", payment.idempotency_key)
    .single();

  if (existing.data) {
    // Event already processed
    console.log("[Sync] Idempotency key exists - skipping duplicate");
    await markSyncItemConfirmed(payment.id);
    return;
  }

  // Collision with different payload - should never happen
  // This indicates a bug in lamport clock generation
  console.error("[Sync] Idempotency key collision with different payload!");
  await markSyncItemFailed(payment.id, "Idempotency key collision");
  // Alert developers - this is a critical bug
  Sentry.captureException(new Error("Idempotency key collision"));
}
```

### Validation Errors

**4. Payment Exceeds PHP Maximum**:

```typescript
function validatePaymentAmount(amountCents: number): ValidationResult {
  const MAX_AMOUNT = 999999999; // ₱9,999,999.99

  if (amountCents > MAX_AMOUNT) {
    return {
      valid: false,
      error: `Payment amount ${formatPHP(amountCents)} exceeds maximum ${formatPHP(MAX_AMOUNT)}`,
      code: "AMOUNT_EXCEEDS_MAXIMUM",
    };
  }

  if (!Number.isInteger(amountCents)) {
    return {
      valid: false,
      error: "Amount must be in whole cents (no fractions)",
      code: "INVALID_AMOUNT_FORMAT",
    };
  }

  return { valid: true };
}
```

**5. Debt Entity Reference Deleted (Internal Debt)**:

```typescript
async function handleOrphanedEntityReference(internalDebt: InternalDebt) {
  // Check if referenced entities still exist
  const fromExists = await validateEntityExists(internalDebt.from_type, internalDebt.from_id);

  if (!fromExists) {
    console.warn(
      `[Debt ${internalDebt.id}] Source entity deleted: ${internalDebt.from_type}/${internalDebt.from_id}`
    );

    // Don't block - use cached display name
    // Flag for user review in UI with tooltip:
    // "Originally '{cached_name}' (entity no longer exists)"

    return {
      status: "orphaned_reference",
      displayName: internalDebt.from_display_name + " (deleted)",
      showTooltip: true,
    };
  }

  return { status: "ok" };
}
```

### Offline Queue Errors

**6. Offline Queue Overflow (IndexedDB Quota)**:

```typescript
async function handleQuotaExceeded(operation: "debt" | "payment") {
  const estimate = await navigator.storage.estimate();
  const percentUsed = (estimate.usage / estimate.quota) * 100;

  if (percentUsed > 95) {
    // Critical - queue cleanup needed
    console.error("[Storage] IndexedDB quota critical:", percentUsed.toFixed(1), "%");

    // Strategy 1: Compact confirmed sync items
    const deleted = await db.syncQueue.where("status").equals("confirmed").delete();

    console.log("[Storage] Deleted", deleted, "confirmed sync items");

    // Strategy 2: Alert user to sync or clear old data
    notifyUser({
      severity: "error",
      message: "Storage almost full - please sync your data",
      action: "SYNC_NOW",
    });

    return false; // Operation blocked
  }

  return true; // Operation allowed
}
```

### Concurrent Modification Errors

**7. Archive Debt Race Condition (Two Devices)**:

```typescript
async function archiveDebt(debtId: string) {
  const debt = await db.debts.get(debtId);

  if (!debt) {
    return { error: "Debt not found", code: "NOT_FOUND" };
  }

  if (debt.status === "archived") {
    // Already archived (by another device)
    console.log("[Archive] Debt already archived - no-op");
    return { success: true, alreadyArchived: true };
  }

  // No optimistic locking - last write wins
  await db.debts.update(debtId, {
    status: "archived",
    closed_at: new Date().toISOString(),
  });

  // Queue event for sync
  await queueEvent({
    entity_type: "debt",
    entity_id: debtId,
    op: "update",
    payload: { status: "archived" },
  });

  return { success: true };
}
```

**8. Payment While Debt Being Archived**:

```typescript
// This is acceptable - payment is queued and will sync
// When payment syncs, it will be accepted (immutable append)
// Balance recalculation will show correct state
// If balance > 0 after payment, debt auto-reactivates (status: paid_off → active)

async function createPaymentWithArchiveCheck(payment: DebtPaymentData) {
  const debt = await db.debts.get(payment.debt_id);

  if (debt?.status === "archived") {
    // Warn user but allow payment (accept-and-track)
    console.warn("[Payment] Creating payment for archived debt");
    showWarning("This debt is archived - payment will still be recorded");
  }

  // Create payment regardless (idempotency prevents duplicates)
  return createDebtPayment(payment);
}
```

**9. Simultaneous Status Updates (Paid Off Detection)**:

```typescript
// No locking needed - status derived from balance
// Race condition is harmless:
// Device A calculates balance = 0, sets paid_off
// Device B calculates balance = 0, sets paid_off
// Both sync → idempotent result (status = paid_off)

async function updateDebtStatusFromBalance(debtId: string) {
  const balance = await calculateDebtBalance(debtId, "external");
  const debt = await db.debts.get(debtId);

  if (!debt) return;

  // Determine correct status from balance
  const targetStatus = balance <= 0 ? "paid_off" : "active";

  // Only update if changed (reduces unnecessary events)
  if (debt.status !== targetStatus && debt.status !== "archived") {
    await db.debts.update(debtId, {
      status: targetStatus,
      closed_at: targetStatus === "paid_off" ? new Date().toISOString() : null,
    });

    // Queue status change event
    await queueEvent({
      entity_type: "debt",
      entity_id: debtId,
      op: "update",
      payload: { status: targetStatus },
    });
  }
}
```

### Error Recovery Functions

**10. Invalid State Recovery**:

```typescript
// Run periodically or on app start to fix inconsistent states
async function performStateRecovery() {
  console.log("[Recovery] Starting debt state recovery");

  // Fix debts with incorrect status based on balance
  const debts = await db.debts.toArray();
  let fixed = 0;

  for (const debt of debts) {
    const balance = await calculateDebtBalance(debt.id, "external");

    // Fix status inconsistencies
    if (balance <= 0 && debt.status === "active") {
      await db.debts.update(debt.id, { status: "paid_off", closed_at: new Date().toISOString() });
      fixed++;
    } else if (balance > 0 && debt.status === "paid_off") {
      await db.debts.update(debt.id, { status: "active", closed_at: null });
      fixed++;
    }
  }

  console.log(`[Recovery] Fixed ${fixed} inconsistent debt statuses`);
}
```

## Testing Strategy

### Unit Tests

```typescript
// src/lib/debts.test.ts
describe("Debt Balance Calculations", () => {
  test("balance derived from payment history", async () => {
    const debt = await createDebt({
      name: "Car Loan",
      original_amount_cents: 100000, // ₱1,000.00
    });

    // Make multiple payments
    await recordPayment(debt.id, 25000); // ₱250.00
    await recordPayment(debt.id, 15000); // ₱150.00

    // Balance should be calculated, not stored
    const balance = await calculateDebtBalance(debt.id, "external");
    expect(balance).toBe(60000); // ₱1,000 - ₱250 - ₱150 = ₱600
  });

  test("compensating events for transaction edit", async () => {
    const debt = await createDebt({
      original_amount_cents: 100000,
    });

    const transaction = await createTransaction({
      amount_cents: 20000,
      debt_id: debt.id,
    });

    // Edit transaction amount
    await editTransaction(transaction.id, { amount_cents: 30000 });

    // Should have: original payment, reversal, new payment
    const payments = await getDebtPayments(debt.id);
    expect(payments).toHaveLength(3);
    expect(payments[0].amount_cents).toBe(20000); // Original
    expect(payments[1].amount_cents).toBe(-20000); // Reversal
    expect(payments[2].amount_cents).toBe(30000); // New

    // Balance should reflect net change
    const balance = await calculateDebtBalance(debt.id, "external");
    expect(balance).toBe(70000); // ₱1,000 - ₱300 = ₱700
  });

  test("overpayment tracking", async () => {
    const debt = await createDebt({
      original_amount_cents: 10000, // ₱100
    });

    // Pay more than balance (accepted but tracked)
    const transaction = await createTransaction({
      amount_cents: 15000, // ₱150
      debt_id: debt.id,
    });

    // Check payment is marked as overpayment
    const payments = await getDebtPayments(debt.id);
    expect(payments[0].is_overpayment).toBe(true);
    expect(payments[0].overpayment_amount).toBe(5000); // ₱50 over

    // Debt should be marked as paid off
    const updated = await getDebt(debt.id);
    expect(updated.status).toBe("paid_off");
  });

  test("status auto-updates to paid_off", async () => {
    const debt = await createDebt({
      original_amount_cents: 10000,
      status: "active",
    });

    // Pay exact balance
    await recordPayment(debt.id, 10000);

    const updated = await getDebt(debt.id);
    expect(updated.status).toBe("paid_off");
    expect(updated.closed_at).toBeDefined();
  });

  test("idempotency prevents duplicate payments", async () => {
    const debt = await createDebt({
      original_amount_cents: 100000,
    });

    const transaction = await createTransaction({
      amount_cents: 20000,
      debt_id: debt.id,
    });

    // Simulate duplicate sync attempt
    await processDebtPayment(transaction, { debt_id: debt.id });
    await processDebtPayment(transaction, { debt_id: debt.id });

    // Should only have one payment
    const payments = await getDebtPayments(debt.id);
    expect(payments).toHaveLength(1);
  });
});
```

### Integration Tests

```typescript
describe('Debt Payment Sync Integration', () => {
  test('handles transaction + payment sync dependency', async () => {
    // Create transaction with debt payment offline
    const txn = await createOfflineTransaction({
      amount_cents: 50000,
      debt_id: 'debt-123',
      type: 'expense'
    });

    // Verify payment queued
    const queueItems = await db.syncQueue
      .where('entity_type')
      .anyOf(['transaction', 'debt_payment'])
      .toArray();

    expect(queueItems).toHaveLength(2);
    expect(queueItems[0].entity_type).toBe('transaction');
    expect(queueItems[1].entity_type).toBe('debt_payment');

    // Sync both
    await syncQueue();

    // Verify both synced successfully
    const remainingItems = await db.syncQueue
      .where('status')
      .equals('queued')
      .count();

    expect(remainingItems).toBe(0);
  });

  test('retries payment if transaction not synced yet', async () => {
    // Simulate payment arriving before transaction
    const payment = createDebtPayment({
      transaction_id: 'non-existent-txn',
      debt_id: 'debt-123',
      amount_cents: 10000
    });

    // Attempt sync - should fail with FK error
    await expect(syncDebtPayment(payment)).rejects.toThrow();

    // Verify payment requeued
    const queueItem = await db.syncQueue.get(payment.id);
    expect(queueItem.status).toBe('queued');
    expect(queueItem.retry_count).toBe(1);
  });

  test('handles network timeout with exponential backoff', async () => {
    const payment = createDebtPayment({...});

    // Mock network timeout
    vi.spyOn(supabase, 'from').mockRejectedValueOnce({
      code: 'ETIMEDOUT'
    });

    // First attempt fails, queues for retry
    await syncDebtPayment(payment);

    const queueItem = await db.syncQueue.get(payment.id);
    expect(queueItem.status).toBe('queued');
    expect(queueItem.retry_count).toBe(1);

    // Second attempt succeeds
    await syncDebtPayment(payment);

    const updatedItem = await db.syncQueue.get(payment.id);
    expect(updatedItem.status).toBe('confirmed');
  });
});

describe('Debt Status State Machine', () => {
  test('transitions active → paid_off when balance = 0', async () => {
    const debt = await createDebt({
      original_amount_cents: 10000,
      status: 'active'
    });

    // Make payment equal to balance
    await recordPayment(debt.id, 10000);

    const updated = await getDebt(debt.id);
    expect(updated.status).toBe('paid_off');
    expect(updated.closed_at).toBeDefined();
  });

  test('transitions paid_off → active on reversal', async () => {
    const debt = await createDebt({
      original_amount_cents: 10000,
      status: 'paid_off',
      closed_at: new Date().toISOString()
    });

    // Create reversal (e.g., transaction deleted)
    const payment = await createPayment(debt.id, 10000);
    await createReversalPayment(payment, 'Transaction deleted');

    const updated = await getDebt(debt.id);
    expect(updated.status).toBe('active');
    expect(updated.closed_at).toBeNull();
  });

  test('archived status remains terminal', async () => {
    const debt = await createDebt({
      original_amount_cents: 10000,
      status: 'archived'
    });

    // Try to make payment
    await recordPayment(debt.id, 10000);

    const updated = await getDebt(debt.id);
    expect(updated.status).toBe('archived'); // Remains archived
  });
});

describe('Internal Debt Entity References', () => {
  test('handles entity deletion gracefully', async () => {
    const category = await createCategory({ name: 'Groceries' });
    const debt = await createInternalDebt({
      from_type: 'category',
      from_id: category.id,
      from_display_name: 'Groceries'
    });

    // Delete referenced category
    await deleteCategory(category.id);

    // Debt still accessible with cached name
    const retrieved = await getInternalDebt(debt.id);
    expect(retrieved.from_display_name).toBe('Groceries');

    // UI should show tooltip indicating deleted entity
    const displayInfo = renderEntityName(retrieved, 'from');
    expect(displayInfo.showTooltip).toBe(true);
  });

  test('prevents self-borrowing', async () => {
    await expect(
      createInternalDebt({
        from_type: 'account',
        from_id: 'acc-123',
        to_type: 'account',
        to_id: 'acc-123'
      })
    ).rejects.toThrow('Cannot borrow from the same entity');
  });
});
```

### E2E Tests

```typescript
// tests/e2e/debts.spec.ts
test("complete debt lifecycle", async ({ page }) => {
  // Create external debt
  await page.goto("/debts");
  await page.click("text=Add Debt");
  await page.fill('[name="name"]', "Credit Card");
  await page.fill('[name="amount"]', "1000");
  await page.click("text=Save");

  // Create expense payment
  await page.goto("/transactions");
  await page.click("text=Add Transaction");
  await page.selectOption('[name="type"]', "expense");
  await page.selectOption('[name="debt"]', "Credit Card");
  await page.fill('[name="amount"]', "400");
  await page.click("text=Save");

  // Create transfer payment
  await page.click("text=Add Transaction");
  await page.selectOption('[name="type"]', "transfer");
  await page.selectOption('[name="debt"]', "Credit Card");
  await page.fill('[name="amount"]', "600");
  await page.click("text=Save");

  // Verify debt is paid off
  await page.goto("/debts");
  await expect(page.locator("text=Paid Off")).toBeVisible();
  await expect(page.locator("text=₱0.00")).toBeVisible();
});

test("internal debt between members", async ({ page }) => {
  // Create internal debt
  await page.goto("/debts");
  await page.click("text=Add Internal Debt");
  await page.fill('[name="name"]', "John borrowed from household");
  await page.selectOption('[name="from_type"]', "member");
  await page.selectOption('[name="from_id"]', "household");
  await page.selectOption('[name="to_type"]', "member");
  await page.selectOption('[name="to_id"]', "John");
  await page.fill('[name="amount"]', "500");
  await page.click("text=Save");

  // Record repayment
  await page.goto("/transactions");
  await page.click("text=Add Transaction");
  await page.selectOption('[name="internal_debt"]', "John borrowed from household");
  await page.fill('[name="amount"]', "200");
  await page.click("text=Save");

  // Verify balance calculated correctly
  await page.goto("/debts");
  await expect(page.locator("text=₱300.00")).toBeVisible();
});

test("transaction edit creates reversal", async ({ page }) => {
  // Create debt and payment
  await createDebtWithPayment(page, "1000", "300");

  // Edit transaction amount
  await page.goto("/transactions");
  await page.click('[data-transaction-id="1"] text=Edit');
  await page.fill('[name="amount"]', "400");
  await page.click("text=Save");

  // Check payment history shows reversal
  await page.goto("/debts");
  await page.click("text=View Payment History");
  await expect(page.locator("text=₱300.00")).toBeVisible(); // Original
  await expect(page.locator("text=-₱300.00")).toBeVisible(); // Reversal
  await expect(page.locator("text=₱400.00")).toBeVisible(); // New
  await expect(page.locator("text=Balance: ₱600.00")).toBeVisible();
});

test("overpayment tracking", async ({ page }) => {
  // Create debt with small balance
  await createDebt(page, "100");

  // Overpay the debt
  await page.goto("/transactions");
  await page.click("text=Add Transaction");
  await page.selectOption('[name="debt"]', "Test Debt");
  await page.fill('[name="amount"]', "150");

  // Should show warning but allow submission
  await expect(page.locator("text=exceeds remaining balance")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();

  await page.click("text=Save");

  // Verify overpayment is tracked
  await page.goto("/debts");
  await page.click("text=View Payment History");
  await expect(page.locator("text=Overpayment: ₱50.00")).toBeVisible();
  await expect(page.locator("text=Status: Paid Off")).toBeVisible();
});
```

## Common Query Patterns

### Transfer Exclusion Verification (CRITICAL)

**Key Principle**: ALL transfers must be excluded from spending analytics to prevent double-counting, including debt-linked transfers.

**Example Scenario**:

```typescript
// User pays credit card debt via transfer from checking
// Transaction 1: Expense from checking (transfer_group_id: 'abc', debt_id: 'xyz')
// Transaction 2: Income to credit card (transfer_group_id: 'abc', debt_id: null)
//
// Spending reports MUST exclude BOTH via transfer_group_id
```

**Correct Spending Query** (Excludes ALL transfers):

```sql
-- Monthly spending by category (CORRECT - excludes all transfers)
SELECT
  c.name AS category,
  SUM(t.amount_cents) AS total_spent
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.household_id = get_user_household_id()
  AND t.type = 'expense'
  AND t.transfer_group_id IS NULL  -- Excludes ALL transfers, including debt-linked
  AND DATE_TRUNC('month', t.date) = '2025-01-01'
GROUP BY c.id, c.name
ORDER BY total_spent DESC;
```

**Budget vs Actual Query** (Excludes transfers):

```sql
-- Budget vs actual spending (CORRECT - transfers excluded)
SELECT
  b.category_id,
  c.name,
  b.amount_cents AS budgeted,
  COALESCE(SUM(t.amount_cents), 0) AS actual_spent,
  (b.amount_cents - COALESCE(SUM(t.amount_cents), 0)) AS remaining
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t ON t.category_id = b.category_id
  AND t.type = 'expense'
  AND t.transfer_group_id IS NULL  -- Critical: Exclude transfers
  AND DATE_TRUNC('month', t.date) = b.month_key
WHERE b.household_id = get_user_household_id()
  AND b.month_key = '2025-01-01'
GROUP BY b.category_id, c.name, b.amount_cents;
```

**Debt Payment History with Transfer Indicator**:

```sql
-- Payment history showing which payments were transfers
SELECT
  dp.id,
  dp.amount_cents,
  dp.payment_date,
  dp.is_overpayment,
  t.type AS transaction_type,
  CASE
    WHEN t.transfer_group_id IS NOT NULL THEN 'Transfer'
    ELSE 'Expense'
  END AS payment_method,
  t.description
FROM debt_payments dp
JOIN transactions t ON t.id = dp.transaction_id
  AND t.deleted_at IS NULL  -- Only show active transactions (soft delete filter)
WHERE dp.debt_id = $1
  AND dp.household_id = get_user_household_id()
  AND dp.is_reversal = false  -- Exclude reversal records
  AND dp.id NOT IN (  -- Exclude payments that were reversed
    SELECT reverses_payment_id
    FROM debt_payments
    WHERE reverses_payment_id IS NOT NULL
  )
ORDER BY dp.payment_date DESC, dp.created_at DESC;
```

**Verification Query** (Ensure no double-counting):

```sql
-- Verify debt-linked transfers are properly excluded
-- This should return 0 if all queries are correct
SELECT COUNT(*) AS double_counted_transfers
FROM transactions t
WHERE t.household_id = get_user_household_id()
  AND t.type = 'expense'
  AND t.transfer_group_id IS NOT NULL
  AND t.debt_id IS NOT NULL
  AND t.id IN (
    -- Check if this appears in any spending report query
    SELECT t2.id
    FROM transactions t2
    WHERE t2.type = 'expense'
    -- Missing: AND t2.transfer_group_id IS NULL
  );
-- If COUNT > 0, spending queries are missing transfer exclusion!
```

### Dashboard: Active Debts with Balances

```sql
-- Get all active debts with calculated balances
SELECT
  d.id,
  d.name,
  d.original_amount_cents,
  (d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)) AS current_balance_cents,
  d.status,
  d.updated_at
FROM debts d
LEFT JOIN debt_payments dp ON dp.debt_id = d.id AND dp.reversed = false
WHERE d.household_id = get_user_household_id()
  AND d.status = 'active'
GROUP BY d.id
ORDER BY d.updated_at DESC;
```

### Payment History with Transaction Details

```sql
-- Get payment history for a debt with linked transaction info
SELECT
  dp.id,
  dp.amount_cents,
  dp.payment_date,
  dp.reversed,
  dp.is_overpayment,
  dp.overpayment_amount,
  dp.adjustment_reason,
  dp.created_at,
  t.description AS transaction_description,
  t.type AS transaction_type,
  t.account_id
FROM debt_payments dp
LEFT JOIN transactions t ON t.id = dp.transaction_id
  AND t.deleted_at IS NULL  -- Only show active transactions (soft delete filter)
WHERE dp.debt_id = $1
  AND dp.household_id = get_user_household_id()
ORDER BY dp.payment_date DESC, dp.created_at DESC;
```

### Internal Debts by Entity

```sql
-- Find all internal debts involving a specific category
SELECT
  id.id,
  id.name,
  id.from_type,
  id.from_display_name,
  id.to_type,
  id.to_display_name,
  id.original_amount_cents,
  (id.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)) AS current_balance_cents,
  id.status
FROM internal_debts id
LEFT JOIN debt_payments dp ON dp.internal_debt_id = id.id AND dp.reversed = false
WHERE id.household_id = get_user_household_id()
  AND ((id.from_type = 'category' AND id.from_id = $1)
    OR (id.to_type = 'category' AND id.to_id = $1))
GROUP BY id.id
ORDER BY id.updated_at DESC;
```

### Total Debt Summary

```sql
-- Get total outstanding debt across all active debts
SELECT
  SUM(d.original_amount_cents - COALESCE(payment_totals.total_paid, 0)) AS total_outstanding
FROM debts d
LEFT JOIN (
  SELECT debt_id, SUM(amount_cents) AS total_paid
  FROM debt_payments
  WHERE reversed = false
  GROUP BY debt_id
) payment_totals ON payment_totals.debt_id = d.id
WHERE d.household_id = get_user_household_id()
  AND d.status = 'active';
```

## Performance Considerations

### 1. Balance Calculation & Caching Strategy

**Complexity**: O(n) where n = number of payments per debt

**MVP Approach** (No dedicated cache):

- Calculate balance on-demand from payment history
- Use TanStack Query for automatic result caching
- Query cache invalidated on payment mutations

**TanStack Query Caching**:

```typescript
// src/hooks/useDebtBalance.ts
export function useDebtBalance(debtId: string, type: "external" | "internal") {
  return useQuery({
    queryKey: ["debtBalance", debtId, type],
    queryFn: () => calculateDebtBalance(debtId, type),

    // Cache configuration
    staleTime: 30 * 1000, // 30 seconds (balance doesn't change often)
    cacheTime: 5 * 60 * 1000, // 5 minutes (keep in cache)
    refetchOnWindowFocus: true, // Refresh when user returns to app
  });
}

// Invalidate cache after payment mutation
const mutation = useMutation({
  mutationFn: createDebtPayment,
  onSuccess: (data) => {
    // Invalidate balance for this debt
    queryClient.invalidateQueries(["debtBalance", data.debt_id || data.internal_debt_id]);

    // Also invalidate debt list (status may have changed)
    queryClient.invalidateQueries(["debts"]);
  },
});
```

**Performance Characteristics**:

- **First Load**: Full calculation (O(n))
- **Subsequent Reads** (within 30s): Cached (O(1))
- **After Payment**: Recalculated once, then cached
- **Dashboard with 10 debts**: 10 × O(n), but cached for 30s

**Scalability Analysis** (Theoretical Estimates - To Be Validated):
| Payments/Debt | Est. Calculation Time | Acceptable? | Notes |
|---------------|----------------------|-------------|-------|
| 10 | < 1ms | ✅ Yes | Simple array iteration + sum |
| 100 | < 10ms | ✅ Yes | Typical household debt scale |
| 500 | < 50ms | ⚠️ Borderline | May affect 60fps rendering |
| 1000+ | > 100ms | ❌ No | Phase B optimization needed |

**⚠️ Important**: These are theoretical estimates based on array iteration complexity (O(n)).
Actual performance depends on:

- Device CPU speed (mobile vs desktop)
- IndexedDB query performance
- JavaScript engine optimization
- Concurrent operations

**Action Items**:

- Measure actual performance with real implementation
- Add performance monitoring for balance calculations
- Set up alerts if calculation times exceed 50ms
- Consider Phase B optimizations if metrics show consistent slowness

**Phase B Optimization Options** (if needed):

1. **Materialized View**: Precomputed balance updated by database triggers
2. **Incremental Calculation**: Store running balance, update on payment
3. **Background Calculation**: Web Worker for large payment histories

**When to Optimize**:

- User feedback about slow balance loading
- Metrics show >100ms calculation times
- Debts regularly exceed 500 payments

**Current Decision**: MVP uses TanStack Query caching only. O(n) calculation acceptable for typical household scale (<100 payments/debt).

2. **Indexing Strategy**:
   - Partial indexes on payment queries (WHERE clauses)
   - Compound indexes for common query patterns
   - Entity reference indexes for internal debts

3. **Query Optimization**:
   - Use indexed `reversed = false` for normal balance calculation
   - Payment history paginated with date ordering
   - Status filtering reduces active debt queries

4. **Sync Efficiency**:
   - Payments are append-only (no update conflicts)
   - Idempotency keys prevent duplicate syncs
   - Batch payment events with transaction syncs

## Migration Path

### Database Migration Script

```sql
-- 1. Create optimized RLS function
-- Using CREATE OR REPLACE to allow re-running migration safely
CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE;

-- 2. Create debt tables (no balance columns)
CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
  name TEXT NOT NULL,
  original_amount_cents BIGINT NOT NULL CHECK (original_amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Unique constraint: prevent duplicate active debt names per household
CREATE UNIQUE INDEX idx_debts_household_name_unique
  ON debts(household_id, LOWER(name))
  WHERE status = 'active';

CREATE TABLE internal_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
  name TEXT NOT NULL,

  -- Source entity (who/what is lending)
  from_type TEXT NOT NULL CHECK (from_type IN ('category', 'account', 'member')),
  from_id UUID NOT NULL,  -- Soft reference (no FK constraint for flexibility)
  from_display_name TEXT NOT NULL,  -- Cached at creation for performance

  -- Destination entity (who/what is borrowing)
  to_type TEXT NOT NULL CHECK (to_type IN ('category', 'account', 'member')),
  to_id UUID NOT NULL,  -- Soft reference (no FK constraint for flexibility)
  to_display_name TEXT NOT NULL,  -- Cached at creation for performance

  -- Note: No FK constraints on from_id and to_id
  -- This allows entities to be deleted/renamed without breaking debt history
  -- Entity existence validated at application layer (DEBT-VALIDATION.md:196-218)
  -- Display names cached at creation time preserve historical context

  original_amount_cents BIGINT NOT NULL CHECK (original_amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Unique constraint: prevent duplicate active internal debt names per household
CREATE UNIQUE INDEX idx_internal_debts_household_name_unique
  ON internal_debts(household_id, LOWER(name))
  WHERE status = 'active';

CREATE TABLE debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
  debt_id UUID REFERENCES debts(id),
  internal_debt_id UUID REFERENCES internal_debts(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
    -- NO CASCADE: Transactions use soft delete (deleted_at timestamp).
    -- Reversal payments are created BEFORE soft delete to maintain debt balance integrity.
    -- Hard deletes should never occur in production.
    -- If CASCADE were added, payment records would be destroyed, breaking audit trail.
  amount_cents BIGINT NOT NULL CHECK (amount_cents != 0),  -- No zero payments
  payment_date DATE NOT NULL,
  device_id TEXT NOT NULL,  -- Device that created this payment (audit trail)
  reversed BOOLEAN DEFAULT FALSE,
  reverses_payment_id UUID REFERENCES debt_payments(id),
  is_overpayment BOOLEAN DEFAULT FALSE,
  overpayment_amount BIGINT,
  adjustment_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure only one debt type is linked
  CONSTRAINT one_debt_type CHECK (
    (debt_id IS NOT NULL AND internal_debt_id IS NULL) OR
    (debt_id IS NULL AND internal_debt_id IS NOT NULL)
  ),

  -- Ensure reversals have negative amounts
  CONSTRAINT reversal_amount_negative CHECK (
    (reverses_payment_id IS NULL) OR
    (reverses_payment_id IS NOT NULL AND amount_cents < 0)
  ),

  -- Ensure overpayment fields are properly linked
  CONSTRAINT overpayment_fields_linked CHECK (
    (is_overpayment = FALSE AND overpayment_amount IS NULL) OR
    (is_overpayment = TRUE AND overpayment_amount IS NOT NULL AND overpayment_amount > 0)
  )
);

-- Trigger to prevent self-borrowing in internal debts
CREATE OR REPLACE FUNCTION check_internal_debt_self_borrow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.from_type = NEW.to_type AND NEW.from_id = NEW.to_id THEN
    RAISE EXCEPTION 'Cannot create internal debt where source and destination are the same';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_self_borrow
BEFORE INSERT OR UPDATE ON internal_debts
FOR EACH ROW EXECUTE FUNCTION check_internal_debt_self_borrow();

-- Trigger for server-side overpayment validation (defense-in-depth)
CREATE OR REPLACE FUNCTION validate_debt_payment_overpayment()
RETURNS TRIGGER AS $$
DECLARE
  current_balance BIGINT;
  debt_original_amount BIGINT;
BEGIN
  -- Calculate current balance for the debt
  IF NEW.debt_id IS NOT NULL THEN
    SELECT
      d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)
    INTO current_balance
    FROM debts d
    LEFT JOIN debt_payments dp ON dp.debt_id = d.id AND dp.reversed = false
    WHERE d.id = NEW.debt_id
    GROUP BY d.original_amount_cents;
  ELSIF NEW.internal_debt_id IS NOT NULL THEN
    SELECT
      d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)
    INTO current_balance
    FROM internal_debts d
    LEFT JOIN debt_payments dp ON dp.internal_debt_id = d.id AND dp.reversed = false
    WHERE d.id = NEW.internal_debt_id
    GROUP BY d.original_amount_cents;
  END IF;

  -- Set overpayment flags (balance <= 0 OR payment > balance)
  NEW.is_overpayment := (current_balance <= 0 OR NEW.amount_cents > current_balance);

  IF NEW.is_overpayment THEN
    NEW.overpayment_amount := CASE
      WHEN current_balance > 0 THEN NEW.amount_cents - current_balance
      ELSE NEW.amount_cents
    END;
  ELSE
    NEW.overpayment_amount := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_payment_overpayment
BEFORE INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION validate_debt_payment_overpayment();

-- Trigger for rate limiting: max debts per household
CREATE OR REPLACE FUNCTION check_debt_count_limit()
RETURNS TRIGGER AS $$
DECLARE
  debt_count INT;
BEGIN
  SELECT COUNT(*) INTO debt_count
  FROM debts
  WHERE household_id = NEW.household_id;

  IF debt_count >= 100 THEN
    RAISE EXCEPTION 'Maximum debt limit (100) reached for household';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_debt_limit
BEFORE INSERT ON debts
FOR EACH ROW EXECUTE FUNCTION check_debt_count_limit();

-- Trigger for rate limiting: max payments per debt
CREATE OR REPLACE FUNCTION check_payment_count_limit()
RETURNS TRIGGER AS $$
DECLARE
  payment_count INT;
BEGIN
  IF NEW.debt_id IS NOT NULL THEN
    SELECT COUNT(*) INTO payment_count
    FROM debt_payments
    WHERE debt_id = NEW.debt_id;

    IF payment_count >= 100 THEN
      RAISE EXCEPTION 'Maximum payment limit (100) reached for this debt';
    END IF;
  ELSIF NEW.internal_debt_id IS NOT NULL THEN
    SELECT COUNT(*) INTO payment_count
    FROM debt_payments
    WHERE internal_debt_id = NEW.internal_debt_id;

    IF payment_count >= 100 THEN
      RAISE EXCEPTION 'Maximum payment limit (100) reached for this debt';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_payment_limit
BEFORE INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION check_payment_count_limit();

-- Trigger to update debt updated_at timestamp when payments are created
CREATE OR REPLACE FUNCTION update_debt_timestamp_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the corresponding debt's updated_at timestamp
  IF NEW.debt_id IS NOT NULL THEN
    UPDATE debts
    SET updated_at = NOW()
    WHERE id = NEW.debt_id;
  ELSIF NEW.internal_debt_id IS NOT NULL THEN
    UPDATE internal_debts
    SET updated_at = NOW()
    WHERE id = NEW.internal_debt_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_debt_on_payment
AFTER INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION update_debt_timestamp_on_payment();

-- 3. Add debt linkage to transactions
ALTER TABLE transactions
  ADD COLUMN debt_id UUID REFERENCES debts(id),
  ADD COLUMN internal_debt_id UUID REFERENCES internal_debts(id);

-- 4. RPC function for lamport clock synchronization
-- Used during device initialization to prevent idempotency key collisions
CREATE OR REPLACE FUNCTION get_max_lamport_clock(p_device_id TEXT)
RETURNS BIGINT AS $$
  SELECT COALESCE(MAX(lamport_clock), 0)
  FROM events
  WHERE device_id = p_device_id
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_max_lamport_clock(TEXT) TO authenticated;

-- 5. Create all indexes
-- [Index creation SQL from above]

-- 6. Apply RLS policies
-- [RLS policy SQL from above]
```

### Dexie Migration

**Version Strategy**:

- Current baseline version: Check `src/lib/dexie/db.ts` to determine next version
- Debt feature version: Hardcode the version number (e.g., version 4)
- IMPORTANT: Never use `db.verno + 1` dynamically - it will create infinite versions on re-runs
- Example: If current is version 3, explicitly set debt migration to version 4

```typescript
// src/lib/dexie/db.ts
// CRITICAL: Hardcode version number - do NOT calculate dynamically
// Check current version in codebase, then set to next integer
const DEBT_MIGRATION_VERSION = 4; // Explicitly set based on current schema

db.version(DEBT_MIGRATION_VERSION)
  .stores({
    // Existing tables (preserve all)
    transactions:
      "id, household_id, date, account_id, category_id, status, transfer_group_id, import_key, *tagged_user_ids",
    accounts: "id, household_id, name, type, created_at",
    categories: "id, household_id, parent_id, name",
    budgets: "id, household_id, category_id, month_key",
    profiles: "id, household_id, email",
    devices: "id, user_id, household_id",
    events: "id, entity_type, entity_id, idempotency_key, created_at",
    syncQueue: "id, device_id, entity_type, status, created_at",
    meta: "key", // Ensure meta table exists

    // NEW: Debt tables (add these)
    debts: "id, household_id, status, created_at",
    internalDebts: "id, household_id, from_type, from_id, to_type, to_id, status, created_at",
    debtPayments: "id, debt_id, internal_debt_id, transaction_id, payment_date, reversed",
  })
  .upgrade(async (tx) => {
    console.log(`[Dexie Migration v${DEBT_MIGRATION_VERSION}] Adding debt tracking tables`);

    // Initialize lamport clock if not exists
    const meta = tx.table("meta");
    const existing = await meta.get("lamport_clock");
    if (!existing) {
      await meta.put({ key: "lamport_clock", value: 0 });
      console.log("[Dexie Migration] Initialized lamport_clock");
    }

    // Data migration: If any existing transactions have debt_id or internal_debt_id
    // (unlikely in MVP, but defensive coding)
    const transactions = tx.table("transactions");
    const debtLinkedCount = await transactions
      .filter((t) => t.debt_id || t.internal_debt_id)
      .count();

    if (debtLinkedCount > 0) {
      console.warn(`[Dexie Migration] Found ${debtLinkedCount} debt-linked transactions`);
      console.warn("[Dexie Migration] Debt payment records should be created via sync");
    }

    console.log(`[Dexie Migration v${DEBT_MIGRATION_VERSION}] Complete`);
  });
```

### Migration Testing Strategy

**Pre-Migration Testing**:

1. ☐ **Backup current IndexedDB** (export to JSON via dev tools)
2. ☐ **Test on clean database** (new browser profile)
3. ☐ **Test with existing data** (populated test database)
4. ☐ **Verify version number** is correctly incremented

**Post-Migration Verification**:

1. ☐ **Check all tables exist**:

   ```typescript
   await db.debts.count(); // Should return 0 (or actual count)
   await db.internalDebts.count(); // Should return 0
   await db.debtPayments.count(); // Should return 0
   ```

2. ☐ **Verify meta table**:

   ```typescript
   const lamport = await db.meta.get("lamport_clock");
   expect(lamport.value).toBe(0);
   ```

3. ☐ **Test debt CRUD operations**:

   ```typescript
   const debt = await db.debts.add({...});
   expect(debt).toBeDefined();
   ```

4. ☐ **Verify existing data intact**:
   ```typescript
   const txnCount = await db.transactions.count();
   expect(txnCount).toBeGreaterThan(0); // Existing transactions preserved
   ```

**Integration Testing**:

1. ☐ Create debt with payment → verify payment record created
2. ☐ Edit debt-linked transaction → verify reversal created
3. ☐ Delete debt-linked transaction → verify reversal + soft delete
4. ☐ Sync offline debt creation → verify server sync works
5. ☐ Test overpayment scenario → verify flags set correctly

### Balance Calculation Performance Testing

**Critical**: Derived balances are calculated on every read. Performance must be validated before MVP release.

**Testing Strategy**:

```typescript
// Performance test suite for balance calculations
describe("Balance Calculation Performance", () => {
  beforeEach(async () => {
    // Clear test data
    await db.debts.clear();
    await db.debtPayments.clear();
  });

  test("Scenario 1: Small payment history (10 payments)", async () => {
    const debt = await createTestDebt({ original_amount_cents: 100000 });
    await createTestPayments(debt.id, 10); // 10 payments

    const startTime = performance.now();
    const balance = await calculateDebtBalance(debt.id, "external");
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(10); // < 10ms
    expect(balance).toBeDefined();
    console.log(`✅ 10 payments: ${duration.toFixed(2)}ms`);
  });

  test("Scenario 2: Medium payment history (100 payments)", async () => {
    const debt = await createTestDebt({ original_amount_cents: 1000000 });
    await createTestPayments(debt.id, 100); // 100 payments

    const startTime = performance.now();
    const balance = await calculateDebtBalance(debt.id, "external");
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(50); // < 50ms (MVP target)
    expect(balance).toBeDefined();
    console.log(`✅ 100 payments: ${duration.toFixed(2)}ms`);
  });

  test("Scenario 3: Large payment history (500 payments)", async () => {
    const debt = await createTestDebt({ original_amount_cents: 5000000 });
    await createTestPayments(debt.id, 500); // 500 payments

    const startTime = performance.now();
    const balance = await calculateDebtBalance(debt.id, "external");
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(100); // < 100ms (acceptable for MVP)
    expect(balance).toBeDefined();
    console.log(`⚠️  500 payments: ${duration.toFixed(2)}ms`);

    if (duration > 50) {
      console.warn("Balance calculation approaching performance limit");
    }
  });

  test("Scenario 4: Very large payment history (1000 payments)", async () => {
    const debt = await createTestDebt({ original_amount_cents: 10000000 });
    await createTestPayments(debt.id, 1000); // 1000 payments

    const startTime = performance.now();
    const balance = await calculateDebtBalance(debt.id, "external");
    const duration = performance.now() - startTime;

    console.log(`❌ 1000 payments: ${duration.toFixed(2)}ms`);

    // Document performance but don't fail (edge case)
    // Recommend event compaction if this becomes common
    if (duration > 100) {
      console.error("Balance calculation exceeds performance budget");
      console.error("Recommend implementing event compaction for debts with 500+ payments");
    }
  });

  test("Scenario 5: Dashboard load (10 debts with varying payment counts)", async () => {
    // Simulate realistic dashboard load
    const debts = await Promise.all([
      createTestDebt({ original_amount_cents: 100000 }), // 0 payments
      createTestDebt({ original_amount_cents: 200000 }), // 5 payments
      createTestDebt({ original_amount_cents: 300000 }), // 10 payments
      createTestDebt({ original_amount_cents: 400000 }), // 25 payments
      createTestDebt({ original_amount_cents: 500000 }), // 50 payments
      createTestDebt({ original_amount_cents: 600000 }), // 100 payments
      createTestDebt({ original_amount_cents: 700000 }), // 150 payments
      createTestDebt({ original_amount_cents: 800000 }), // 200 payments
      createTestDebt({ original_amount_cents: 900000 }), // 250 payments
      createTestDebt({ original_amount_cents: 1000000 }), // 300 payments
    ]);

    await createTestPayments(debts[1].id, 5);
    await createTestPayments(debts[2].id, 10);
    await createTestPayments(debts[3].id, 25);
    await createTestPayments(debts[4].id, 50);
    await createTestPayments(debts[5].id, 100);
    await createTestPayments(debts[6].id, 150);
    await createTestPayments(debts[7].id, 200);
    await createTestPayments(debts[8].id, 250);
    await createTestPayments(debts[9].id, 300);

    // Calculate all balances (simulating dashboard render)
    const startTime = performance.now();
    const balances = await Promise.all(
      debts.map((debt) => calculateDebtBalance(debt.id, "external"))
    );
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(500); // < 500ms for dashboard (MVP target)
    expect(balances).toHaveLength(10);
    console.log(`📊 Dashboard (10 debts, 1090 total payments): ${duration.toFixed(2)}ms`);
  });
});
```

**Performance Monitoring Setup**:

```typescript
// Add to production code for monitoring
const BALANCE_CALC_THRESHOLD = 50; // ms

async function calculateDebtBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<number> {
  const startTime = performance.now();

  // ... existing calculation logic ...

  const duration = performance.now() - startTime;

  // Log slow calculations in production
  if (duration > BALANCE_CALC_THRESHOLD) {
    console.warn(
      `[Performance] Balance calculation slow: ${duration.toFixed(2)}ms for debt ${debtId}`
    );

    // Send to Sentry for monitoring
    if (typeof Sentry !== "undefined") {
      Sentry.captureMessage("Slow balance calculation", {
        level: "warning",
        extra: {
          debtId,
          duration,
          type,
        },
      });
    }
  }

  return balance;
}
```

**Performance Budget**:

- **10 payments**: < 10ms (✅ Expected)
- **100 payments**: < 50ms (✅ MVP Target)
- **500 payments**: < 100ms (⚠️ Acceptable but monitor)
- **1000+ payments**: > 100ms (❌ Consider event compaction)
- **Dashboard (10 debts)**: < 500ms (✅ MVP Target)

**Action Items**:

1. ☐ Run performance tests with realistic payment counts before MVP launch
2. ☐ Set up Sentry performance monitoring for balance calculations
3. ☐ Add alert if 95th percentile exceeds 50ms
4. ☐ Document event compaction strategy if 500+ payments become common
5. ☐ Consider memo-based caching for frequently accessed debts (Phase B)

**Optimization Strategies (Phase B)**:

- **Event Compaction**: Compress 100+ payment events into single aggregate event
- **Memo Caching**: Cache balance calculations with 60s TTL, invalidate on mutations
- **Indexed Aggregates**: Periodic background job to compute and cache balances
- **Query Optimization**: Add covering indexes for balance calculation queries

### Data Migration (If Existing Debts)

**Scenario**: If debts already exist in production (unlikely for MVP, but defensive):

```typescript
// Run after migration if debts found
async function migrateExistingDebtData() {
  // 1. Find all debts (if any exist from previous implementation)
  const existingDebts = await db.debts.toArray();

  for (const debt of existingDebts) {
    // 2. If debt has stored balance, recalculate from payments
    const payments = await db.debtPayments.where("debt_id").equals(debt.id).toArray();

    const calculatedBalance =
      debt.original_amount_cents -
      payments.reduce((sum, p) => sum + (p.reversed ? 0 : p.amount_cents), 0);

    // 3. Update status based on calculated balance
    if (calculatedBalance <= 0 && debt.status === "active") {
      await db.debts.update(debt.id, {
        status: "paid_off",
        closed_at: new Date().toISOString(),
      });
    }

    console.log(`[Data Migration] Updated debt ${debt.id}, balance: ${calculatedBalance}`);
  }
}
```

### Rollback Plan

**Pre-Rollback Checklist**:

1. ☐ **Export debt data** before rollback (if any debts exist)

   ```sql
   -- Export debts
   COPY (SELECT * FROM debts) TO '/tmp/debts_backup.csv' CSV HEADER;
   COPY (SELECT * FROM internal_debts) TO '/tmp/internal_debts_backup.csv' CSV HEADER;
   COPY (SELECT * FROM debt_payments) TO '/tmp/debt_payments_backup.csv' CSV HEADER;
   ```

2. ☐ **Check for linked transactions**

   ```sql
   SELECT COUNT(*) FROM transactions WHERE debt_id IS NOT NULL OR internal_debt_id IS NOT NULL;
   ```

3. ☐ **Clear sync queue** of debt-related items

   ```sql
   -- Check pending debt sync items
   SELECT * FROM sync_queue WHERE entity_type IN ('debt', 'internal_debt', 'debt_payment');

   -- Delete or mark as failed
   DELETE FROM sync_queue WHERE entity_type IN ('debt', 'internal_debt', 'debt_payment');
   ```

**Rollback SQL**:

```sql
BEGIN;

-- 1. Remove debt events from unified events table
DELETE FROM events WHERE entity_type IN ('debt', 'internal_debt', 'debt_payment');

-- 2. Drop foreign key constraints on transactions (if they exist)
ALTER TABLE transactions
  DROP COLUMN IF EXISTS debt_id,
  DROP COLUMN IF EXISTS internal_debt_id;

-- 3. Drop debt tables (CASCADE handles dependent objects)
DROP TABLE IF EXISTS debt_payments CASCADE;
DROP TABLE IF EXISTS internal_debts CASCADE;
DROP TABLE IF EXISTS debts CASCADE;

-- 4. Drop helper functions
DROP FUNCTION IF EXISTS get_debt_with_balance(UUID);
DROP FUNCTION IF EXISTS list_debts_with_balances(TEXT);
DROP FUNCTION IF EXISTS can_delete_debt(UUID);
DROP FUNCTION IF EXISTS check_internal_debt_entities();
DROP FUNCTION IF EXISTS get_user_household_id();  -- Only if created for debts

-- 5. Drop triggers
DROP TRIGGER IF EXISTS prevent_self_borrowing ON internal_debts;

COMMIT;
```

**Post-Rollback Checklist**: 4. ☐ **Verify transactions table** has no orphaned debt references 5. ☐ **Clear Dexie IndexedDB** on client using the cleanup script below 6. ☐ **Restart application** to ensure no cached debt data 7. ☐ **Test transaction creation** (ensure no debt-related errors)

**Client-Side Rollback Script**:

```typescript
// Run this in browser console or as migration script
// Clears all debt-related data from IndexedDB
async function rollbackDebtFeatureClient() {
  console.log("[Rollback] Starting client-side debt data cleanup...");

  try {
    // 1. Delete all debt data from IndexedDB
    const debtsCleared = await db.debts.clear();
    console.log(`[Rollback] Cleared ${debtsCleared} debts`);

    const internalDebtsCleared = await db.internalDebts.clear();
    console.log(`[Rollback] Cleared ${internalDebtsCleared} internal debts`);

    const paymentsCleared = await db.debtPayments.clear();
    console.log(`[Rollback] Cleared ${paymentsCleared} debt payments`);

    // 2. Remove debt-related sync queue items
    const syncItemsDeleted = await db.syncQueue
      .where("entity_type")
      .anyOf(["debt", "internal_debt", "debt_payment"])
      .delete();
    console.log(`[Rollback] Deleted ${syncItemsDeleted} sync queue items`);

    // 3. Clear debt-related events from local event log
    const eventsDeleted = await db.events
      .where("entity_type")
      .anyOf(["debt", "internal_debt", "debt_payment"])
      .delete();
    console.log(`[Rollback] Deleted ${eventsDeleted} event records`);

    // 4. Clear debt linkage from transactions (set to null)
    const transactions = await db.transactions
      .filter((t) => t.debt_id || t.internal_debt_id)
      .toArray();

    for (const txn of transactions) {
      await db.transactions.update(txn.id, {
        debt_id: undefined,
        internal_debt_id: undefined,
      });
    }
    console.log(`[Rollback] Cleared debt linkage from ${transactions.length} transactions`);

    console.log("✅ [Rollback] Client-side debt data cleared successfully");
    console.log("⚠️  [Rollback] Please restart the application to complete rollback");

    return {
      success: true,
      summary: {
        debts: debtsCleared,
        internalDebts: internalDebtsCleared,
        payments: paymentsCleared,
        syncItems: syncItemsDeleted,
        events: eventsDeleted,
        transactionsUpdated: transactions.length,
      },
    };
  } catch (error) {
    console.error("❌ [Rollback] Client-side cleanup failed:", error);
    return { success: false, error };
  }
}

// Execute rollback
rollbackDebtFeatureClient().then((result) => {
  console.log("[Rollback] Result:", result);
});
```

**Rollback Dexie**:

```typescript
// Increment version to remove debt tables
const currentVersion = db.verno;
db.version(currentVersion + 1).stores({
  // Remove debt table definitions
  debts: null,
  internalDebts: null,
  debtPayments: null,
  // Keep other tables unchanged
});
```
