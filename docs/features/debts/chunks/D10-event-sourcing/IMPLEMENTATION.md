# D10 Implementation: Event Sourcing Integration

**Time estimate**: 1.5 hours
**Prerequisites**: D1-D9 complete, existing event sourcing system

---

## Step 0: Verify Event Sourcing System (10 min)

Check if event sourcing infrastructure exists in the codebase.

```bash
# Check for events table in Dexie schema
grep -A 10 "events" src/lib/dexie.ts

# Check for event creation utilities
find src -name "*event*" -type f

# Check for lamport clock (should exist from D5)
grep -r "lamportClock\|getNextLamportClock" src/lib/
```

**If event sourcing doesn't exist yet**:

This implementation assumes basic event infrastructure exists. If not, create minimal implementation:

**File**: `src/lib/dexie.ts` (MODIFY - add events table)

```typescript
// Add to Dexie schema
events: "++id, entityType, entityId, timestamp, lamportClock, [entityType+entityId]";
```

**File**: `src/lib/events/types.ts` (CREATE minimal types)

```typescript
export interface BaseEvent {
  id: string;
  entityType: string;
  entityId: string;
  op: "create" | "update" | "delete";
  payload: Record<string, any>;
  idempotencyKey: string;
  lamportClock: number;
  vectorClock: Record<string, number>;
  actorUserId: string;
  deviceId: string;
  timestamp: number;
  created_at: string;
}
```

---

## Step 1: Define Debt Event Types (10 min)

Add event types for debt entities.

**File**: `src/types/debt.ts` (MODIFY - add event types)

```typescript
// Add to existing debt.ts

/**
 * Base event structure for debt entities
 */
export interface BaseDebtEvent {
  id: string;
  entityType: "debt" | "internal_debt" | "debt_payment";
  entityId: string;
  op: "create" | "update" | "delete";
  payload: Record<string, any>;
  idempotencyKey: string;
  lamportClock: number;
  vectorClock: Record<string, number>;
  actorUserId: string;
  deviceId: string;
  timestamp: number;
  created_at: string;
}

/**
 * Debt create/update event
 */
export interface DebtEvent extends BaseDebtEvent {
  entityType: "debt";
  payload: Partial<Debt>;
}

/**
 * Internal debt create/update event
 */
export interface InternalDebtEvent extends BaseDebtEvent {
  entityType: "internal_debt";
  payload: Partial<InternalDebt>;
}

/**
 * Debt payment create event (includes reversals)
 */
export interface DebtPaymentEvent extends BaseDebtEvent {
  entityType: "debt_payment";
  payload: DebtPayment;
}

/**
 * Union type for all debt events
 */
export type AnyDebtEvent = DebtEvent | InternalDebtEvent | DebtPaymentEvent;
```

---

## Step 2: Create Event Generation Utilities (20 min)

Core utilities for creating debt events.

**File**: `src/lib/debts/events.ts` (NEW)

```typescript
import { nanoid } from "nanoid";
import { db } from "@/lib/dexie";
import { getDeviceId } from "@/lib/device";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";
import type {
  Debt,
  InternalDebt,
  DebtPayment,
  DebtEvent,
  InternalDebtEvent,
  DebtPaymentEvent,
} from "@/types/debt";

/**
 * Get current user ID
 * TODO: Replace with actual auth context
 */
async function getCurrentUserId(): Promise<string> {
  // Placeholder - replace with actual auth
  return "user-1";
}

/**
 * Calculate delta between before and after states
 *
 * Returns only fields that changed
 */
export function calculateDelta<T extends Record<string, any>>(before: T, after: T): Partial<T> {
  const delta: Partial<T> = {};

  for (const key in after) {
    if (after[key] !== before[key]) {
      delta[key] = after[key];
    }
  }

  return delta;
}

/**
 * Create event for debt operation
 *
 * @param debt - Debt entity
 * @param op - Operation type
 * @param changedFields - Changed fields (for update)
 * @returns Created event
 */
export async function createDebtEvent(
  debt: Debt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<Debt>
): Promise<DebtEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();
  const actorUserId = await getCurrentUserId();

  const event: DebtEvent = {
    id: nanoid(),
    entityType: "debt",
    entityId: debt.id,
    op,
    payload: op === "create" ? debt : changedFields || {},
    idempotencyKey: `${deviceId}-debt-${debt.id}-${lamportClock}`,
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);
  return event;
}

/**
 * Create event for internal debt operation
 */
export async function createInternalDebtEvent(
  debt: InternalDebt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<InternalDebt>
): Promise<InternalDebtEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();
  const actorUserId = await getCurrentUserId();

  const event: InternalDebtEvent = {
    id: nanoid(),
    entityType: "internal_debt",
    entityId: debt.id,
    op,
    payload: op === "create" ? debt : changedFields || {},
    idempotencyKey: `${deviceId}-internal_debt-${debt.id}-${lamportClock}`,
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);
  return event;
}

/**
 * Create event for debt payment operation
 *
 * IMPORTANT: Reuses idempotency key from payment record
 */
export async function createDebtPaymentEvent(
  payment: DebtPayment,
  op: "create"
): Promise<DebtPaymentEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();
  const actorUserId = await getCurrentUserId();

  const event: DebtPaymentEvent = {
    id: nanoid(),
    entityType: "debt_payment",
    entityId: payment.id,
    op,
    payload: payment,
    // Reuse payment's idempotency key
    idempotencyKey: payment.idempotency_key,
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);
  return event;
}

/**
 * Check if event with idempotency key already exists
 *
 * @param idempotencyKey - Idempotency key to check
 * @returns True if event exists
 */
export async function eventExists(idempotencyKey: string): Promise<boolean> {
  const existing = await db.events.where("idempotencyKey").equals(idempotencyKey).first();

  return existing !== undefined;
}
```

**Verification**:

```typescript
import { createDebtEvent, calculateDelta } from "@/lib/debts/events";

// Test delta calculation
const before = { name: "Old", status: "active" as const, amount: 100 };
const after = { name: "New", status: "active" as const, amount: 100 };
const delta = calculateDelta(before, after);
console.assert(Object.keys(delta).length === 1);
console.assert(delta.name === "New");
```

---

## Step 3: Integrate Events into Debt CRUD (15 min)

Add event generation to debt CRUD operations.

**File**: `src/lib/debts/crud.ts` (MODIFY)

```typescript
import { createDebtEvent, createInternalDebtEvent, calculateDelta } from "./events";

// MODIFY: createExternalDebt
export async function createExternalDebt(data: DebtFormData): Promise<Debt> {
  // ... existing validation ...

  const debt: Debt = {
    id: nanoid(),
    household_id: data.household_id,
    name: data.name.trim(),
    original_amount_cents: data.original_amount_cents,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Create entity
  await db.debts.add(debt);

  // Create event
  await createDebtEvent(debt, "create");

  return debt;
}

// MODIFY: createInternalDebt
export async function createInternalDebt(data: InternalDebtFormData): Promise<InternalDebt> {
  // ... existing validation ...

  const debt: InternalDebt = {
    id: nanoid(),
    household_id: data.household_id,
    from_type: data.from_type,
    from_id: data.from_id,
    to_type: data.to_type,
    to_id: data.to_id,
    original_amount_cents: data.original_amount_cents,
    description: data.description,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Create entity
  await db.internalDebts.add(debt);

  // Create event
  await createInternalDebtEvent(debt, "create");

  return debt;
}

// MODIFY: updateDebtName
export async function updateDebtName(
  debtId: string,
  type: "external" | "internal",
  newName: string
): Promise<void> {
  // Get existing debt
  const existing =
    type === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);

  if (!existing) {
    throw new Error(`Debt ${debtId} not found`);
  }

  // Update entity
  const updated = {
    ...existing,
    name: newName.trim(),
    updated_at: new Date().toISOString(),
  };

  if (type === "external") {
    await db.debts.update(debtId, updated);

    // Create event with delta
    const delta = calculateDelta(existing, updated);
    await createDebtEvent(updated as Debt, "update", delta);
  } else {
    await db.internalDebts.update(debtId, updated);

    const delta = calculateDelta(existing, updated);
    await createInternalDebtEvent(updated as InternalDebt, "update", delta);
  }
}

// MODIFY: archiveDebt
export async function archiveDebt(debtId: string, type: "external" | "internal"): Promise<void> {
  // Get existing debt
  const existing =
    type === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);

  if (!existing) {
    throw new Error(`Debt ${debtId} not found`);
  }

  // Update entity
  const updated = {
    ...existing,
    status: "archived" as const,
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (type === "external") {
    await db.debts.update(debtId, updated);

    // Create event with delta
    const delta = calculateDelta(existing, updated);
    await createDebtEvent(updated as Debt, "update", delta);
  } else {
    await db.internalDebts.update(debtId, updated);

    const delta = calculateDelta(existing, updated);
    await createInternalDebtEvent(updated as InternalDebt, "update", delta);
  }
}
```

**Verification**:

```typescript
// Create debt
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Check event created
const events = await db.events.where("entityId").equals(debt.id).toArray();

console.assert(events.length === 1);
console.assert(events[0].op === "create");
console.assert(events[0].entityType === "debt");
```

---

## Step 4: Integrate Events into Payment Processing (15 min)

Add event generation to payment operations.

**File**: `src/lib/debts/payments.ts` (MODIFY)

```typescript
import { createDebtPaymentEvent } from "./events";

// MODIFY: processDebtPayment
export async function processDebtPayment(data: ProcessPaymentData): Promise<PaymentResult> {
  // ... existing payment creation logic ...

  const payment: DebtPayment = {
    id: nanoid(),
    // ... existing fields ...
    idempotency_key: `${deviceId}-debt_payment-${paymentId}-${lamportClock}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Create payment
  await db.debtPayments.add(payment);

  // Create event (reuses payment's idempotency key)
  await createDebtPaymentEvent(payment, "create");

  // ... existing status update logic ...

  return {
    payment,
    wasOverpayment: isOverpayment,
    overpaymentAmount,
    newBalance,
    statusChanged,
    newStatus,
  };
}
```

**Verification**:

```typescript
// Process payment
const result = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: "debt-1",
  household_id: "h1",
});

// Check event created
const events = await db.events.where("entityId").equals(result.payment.id).toArray();

console.assert(events.length === 1);
console.assert(events[0].entityType === "debt_payment");
console.assert(events[0].idempotencyKey === result.payment.idempotency_key);
```

---

## Step 5: Integrate Events into Reversals (15 min)

Add event generation to reversal operations.

**File**: `src/lib/debts/reversals.ts` (MODIFY)

```typescript
import { createDebtPaymentEvent } from "./events";

// MODIFY: reverseDebtPayment
export async function reverseDebtPayment(data: CreateReversalData): Promise<ReversalResult> {
  // ... existing reversal creation logic ...

  const reversal: DebtPayment = {
    id: reversalId,
    // ... existing fields ...
    is_reversal: true,
    reverses_payment_id: data.payment_id,
    idempotency_key: `${deviceId}-debt_payment-${reversalId}-${lamportClock}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Create reversal
  await db.debtPayments.add(reversal);

  // Create event
  await createDebtPaymentEvent(reversal, "create");

  // ... existing status update logic ...

  return {
    reversal,
    originalPayment,
    newBalance,
    statusChanged,
    newStatus,
  };
}
```

**Verification**:

```typescript
// Create payment
const payment = await processDebtPayment({...});

// Reverse payment
const result = await reverseDebtPayment({ payment_id: payment.payment.id });

// Check reversal event created
const events = await db.events
  .where('entityId').equals(result.reversal.id)
  .toArray();

console.assert(events.length === 1);
console.assert(events[0].entityType === 'debt_payment');
console.assert(events[0].payload.is_reversal === true);
```

---

## Step 6: Add Idempotency Check (Optional - 10 min)

Prevent duplicate events if operation retried.

**File**: `src/lib/debts/events.ts` (MODIFY - add to event creation functions)

```typescript
// MODIFY: createDebtEvent (add idempotency check)
export async function createDebtEvent(
  debt: Debt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<Debt>
): Promise<DebtEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();
  const actorUserId = await getCurrentUserId();

  const idempotencyKey = `${deviceId}-debt-${debt.id}-${lamportClock}`;

  // Check if event already exists (idempotent)
  const existing = await db.events.where("idempotencyKey").equals(idempotencyKey).first();

  if (existing) {
    console.log(`Event with key ${idempotencyKey} already exists, skipping`);
    return existing as DebtEvent;
  }

  const event: DebtEvent = {
    id: nanoid(),
    entityType: "debt",
    entityId: debt.id,
    op,
    payload: op === "create" ? debt : changedFields || {},
    idempotencyKey,
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);
  return event;
}

// Apply same pattern to createInternalDebtEvent and createDebtPaymentEvent
```

**Verification**:

```typescript
// Create debt
const debt = await createExternalDebt({...});

// Try to create same event again (simulate retry)
const debt2 = await db.debts.get(debt.id);
await createDebtEvent(debt2!, 'create');

// Check only one event exists
const events = await db.events
  .where('entityId').equals(debt.id)
  .and(e => e.op === 'create')
  .toArray();

console.assert(events.length === 1, 'Idempotent event creation');
```

---

## Step 7: Add Event Query Helpers (10 min)

Utilities for querying events by entity.

**File**: `src/lib/debts/events.ts` (ADD)

```typescript
/**
 * Get all events for a debt
 *
 * @param debtId - Debt ID
 * @param type - Debt type
 * @returns Events ordered by lamport clock
 */
export async function getDebtEvents(
  debtId: string,
  type: "external" | "internal"
): Promise<(DebtEvent | InternalDebtEvent)[]> {
  const entityType = type === "external" ? "debt" : "internal_debt";

  const events = await db.events
    .where("[entityType+entityId]")
    .equals([entityType, debtId])
    .sortBy("lamportClock");

  return events as (DebtEvent | InternalDebtEvent)[];
}

/**
 * Get all events for a debt payment
 *
 * @param paymentId - Payment ID
 * @returns Events ordered by lamport clock
 */
export async function getPaymentEvents(paymentId: string): Promise<DebtPaymentEvent[]> {
  const events = await db.events
    .where("[entityType+entityId]")
    .equals(["debt_payment", paymentId])
    .sortBy("lamportClock");

  return events as DebtPaymentEvent[];
}

/**
 * Get all debt-related events in time range
 *
 * @param startTimestamp - Start timestamp (Unix ms)
 * @param endTimestamp - End timestamp (Unix ms)
 * @returns Events ordered by lamport clock
 */
export async function getDebtEventsInRange(
  startTimestamp: number,
  endTimestamp: number
): Promise<AnyDebtEvent[]> {
  const events = await db.events
    .where("timestamp")
    .between(startTimestamp, endTimestamp)
    .and(
      (e) =>
        e.entityType === "debt" ||
        e.entityType === "internal_debt" ||
        e.entityType === "debt_payment"
    )
    .sortBy("lamportClock");

  return events as AnyDebtEvent[];
}
```

**Verification**:

```typescript
// Create debt with multiple operations
const debt = await createExternalDebt({...});
await updateDebtName(debt.id, 'external', 'New Name');
await archiveDebt(debt.id, 'external');

// Get all events for debt
const events = await getDebtEvents(debt.id, 'external');

console.assert(events.length === 3);
console.assert(events[0].op === 'create');
console.assert(events[1].op === 'update');
console.assert(events[2].op === 'update'); // Archive is update
```

---

## Step 8: Export Event Functions (5 min)

**File**: `src/lib/debts/index.ts` (MODIFY)

```typescript
// ... existing exports ...

export {
  createDebtEvent,
  createInternalDebtEvent,
  createDebtPaymentEvent,
  calculateDelta,
  eventExists,
  getDebtEvents,
  getPaymentEvents,
  getDebtEventsInRange,
} from "./events";

export type { DebtEvent, InternalDebtEvent, DebtPaymentEvent, AnyDebtEvent } from "@/types/debt";
```

---

## Final Verification

Test complete event flow end-to-end:

```typescript
import { db } from "@/lib/dexie";
import {
  createExternalDebt,
  processDebtPayment,
  updateDebtName,
  reverseDebtPayment,
  archiveDebt,
  getDebtEvents,
  getPaymentEvents,
} from "@/lib/debts";

async function testEventFlow() {
  // 1. Create debt
  const debt = await createExternalDebt({
    name: "Test Debt",
    original_amount_cents: 100000,
    household_id: "h1",
  });

  // 2. Check create event
  let events = await getDebtEvents(debt.id, "external");
  console.assert(events.length === 1, "Create event exists");
  console.assert(events[0].op === "create");
  console.assert(events[0].payload.name === "Test Debt");

  // 3. Make payment
  const payment = await processDebtPayment({
    transaction_id: "txn-1",
    amount_cents: 50000,
    payment_date: "2025-11-10",
    debt_id: debt.id,
    household_id: "h1",
  });

  // 4. Check payment event
  let paymentEvents = await getPaymentEvents(payment.payment.id);
  console.assert(paymentEvents.length === 1, "Payment event exists");
  console.assert(paymentEvents[0].payload.amount_cents === 50000);

  // 5. Update debt name
  await updateDebtName(debt.id, "external", "Updated Name");

  // 6. Check update event
  events = await getDebtEvents(debt.id, "external");
  console.assert(events.length === 2, "Update event added");
  console.assert(events[1].op === "update");
  console.assert(events[1].payload.name === "Updated Name");
  console.assert(!events[1].payload.original_amount_cents, "Delta only");

  // 7. Reverse payment
  const reversal = await reverseDebtPayment({ payment_id: payment.payment.id });

  // 8. Check reversal event
  paymentEvents = await getPaymentEvents(reversal.reversal.id);
  console.assert(paymentEvents.length === 1, "Reversal event exists");
  console.assert(paymentEvents[0].payload.is_reversal === true);

  // 9. Archive debt
  await archiveDebt(debt.id, "external");

  // 10. Check archive event
  events = await getDebtEvents(debt.id, "external");
  console.assert(events.length === 3, "Archive event added");
  console.assert(events[2].payload.status === "archived");

  // 11. Verify event ordering (lamport clock)
  console.assert(events[0].lamportClock < events[1].lamportClock);
  console.assert(events[1].lamportClock < events[2].lamportClock);

  console.log("✅ All event flow tests passed");
}

testEventFlow();
```

---

## Troubleshooting

### Issue: Events not created

**Symptom**: Entity created but no event in events table.

**Cause**: Event creation function not called or erroring silently.

**Fix**:

```typescript
// Add try-catch around event creation
try {
  await createDebtEvent(debt, "create");
} catch (error) {
  console.error("Failed to create event:", error);
  // Don't throw - entity already created, continue
}
```

---

### Issue: Duplicate idempotency keys

**Symptom**: Error "unique constraint violation" on idempotencyKey.

**Cause**: Lamport clock not incrementing or device ID collision.

**Fix**: Verify lamport clock increments:

```typescript
const clock1 = await getNextLamportClock();
const clock2 = await getNextLamportClock();
console.assert(clock2 > clock1, "Clock must increment");
```

---

### Issue: Event payload too large

**Symptom**: Storage quota exceeded or slow queries.

**Cause**: Storing full entity in update events instead of delta.

**Fix**: Use calculateDelta for updates:

```typescript
// CORRECT: Delta only
const delta = calculateDelta(before, after);
await createDebtEvent(debt, "update", delta);

// WRONG: Full entity
await createDebtEvent(debt, "update", debt); // Too large!
```

---

## ★ Insight ─────────────────────────────────────

**Idempotency Key Reuse**: This implementation **reuses** the idempotency key from debt payments for their events. This is intentional:

1. **Single Source of Truth**: Payment already has idempotency key
2. **Consistency**: Payment and its event use same key
3. **Server Deduplication**: Server can dedupe by single key

Alternative approach (separate keys) would require tracking two keys per operation and coordinating them - unnecessary complexity.

**Delta Events Pattern**: Storing only changed fields in update events provides:

- **Smaller events**: 10-100x size reduction
- **Clearer intent**: See exactly what changed
- **Easier merging**: Conflict resolution on field level

Example: Updating name on 1MB entity creates 50-byte event vs 1MB event.

**Event Creation as Side Effect**: Events are created **after** entity operations as side effects. If event creation fails, the entity operation has already succeeded. This is acceptable because:

- Entity is the source of truth
- Events can be reconstructed from entities
- Background job can detect missing events

This "eventual consistency" approach prevents entity operations from failing due to event system issues.

─────────────────────────────────────────────────

---

**Time check**: You should have completed D10 in ~1.5 hours.

**Next**: Chunk D11 - Sync Queue Integration
