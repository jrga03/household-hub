# Chunk D10: Event Sourcing Integration

## At a Glance

- **Time**: 1.5 hours
- **Prerequisites**: D1-D9 complete, existing event sourcing system
- **Can Skip**: Yes if not using event sourcing (but recommended)
- **Depends On**: Event creation utilities, lamport clock, device ID

## What You're Building

Event generation for all debt operations to enable unified audit trail and sync:

- **Event creation**: Generate events for debt/payment create/update/delete
- **Entity types**: `debt`, `internal_debt`, `debt_payment`
- **Operations**: `create`, `update`, `delete` (soft via status change)
- **Idempotency keys**: Already generated in D5, use for events
- **Lamport clock**: Monotonically increasing event counter
- **Event payloads**: Changed fields only (delta events)
- **Integration**: Hook into existing CRUD operations

## Why This Matters

Event sourcing provides **critical capabilities** for the debt system:

- **Audit trail**: Complete history of who changed what and when
- **Sync foundation**: Events are the unit of synchronization
- **Conflict resolution**: Vector clocks and lamport clocks enable deterministic merging
- **Debugging**: Replay events to understand how debt state evolved
- **Compliance**: Immutable log for financial record-keeping
- **Multi-device**: Events from all devices merge cleanly

This chunk integrates debts into the existing event sourcing architecture.

## Before You Start

Verify these prerequisites:

- [ ] **Event sourcing system exists** - Check for `events` table in Dexie schema
- [ ] **Event creation utilities** - Functions to create/store events
- [ ] **Lamport clock** - Persistent counter (implemented in D5)
- [ ] **Device ID** - Device identification (existing)
- [ ] **Debt CRUD operations** complete (D4-D6)

**How to verify**:

```bash
# Check for existing event sourcing code
grep -r "createEvent\|events\|lamportClock" src/lib/

# Check Dexie schema has events table
grep "events" src/lib/dexie.ts
```

## What Happens Next

After this chunk:

- All debt operations generate events
- Events stored in local events table
- Ready for Chunk D11 (Sync Queue Integration)
- Events can be synced to server

## Key Files Created/Modified

```
src/
├── lib/
│   └── debts/
│       ├── events.ts                   # NEW: Event creation for debts
│       ├── crud.ts                     # MODIFIED: Add event generation
│       ├── payments.ts                 # MODIFIED: Add event generation
│       └── reversals.ts                # MODIFIED: Add event generation
└── types/
    └── debt.ts                         # MODIFIED: Add event types
```

## Features Included

### Event Structure

**Debt event format**:

```typescript
{
  id: string;                    // Event ID (nanoid)
  entityType: 'debt';            // Entity type
  entityId: string;              // Debt ID
  op: 'create' | 'update' | 'delete';
  payload: {                     // Changed fields only
    name?: string;
    status?: DebtStatus;
    // ... other changed fields
  };

  // Idempotency
  idempotencyKey: string;        // Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}

  // Conflict resolution
  lamportClock: number;          // Monotonically increasing counter
  vectorClock: Record<string, number>; // Per-device counters

  // Tracking
  actorUserId: string;           // Who made the change
  deviceId: string;              // Which device
  timestamp: number;             // When (Unix timestamp)

  created_at: string;            // ISO timestamp
}
```

### Entity Types

**Three entity types**:

- `debt`: External debts (banks, creditors)
- `internal_debt`: IOUs between users/accounts
- `debt_payment`: Payment records (including reversals)

### Operation Types

**Three operations**:

- `create`: New entity created
- `update`: Existing entity modified (name change, status change)
- `delete`: Soft delete (status changed to 'archived')

**Note**: Physical deletes don't generate events (they're prevented by validation in D4).

### Delta Events Pattern

**Only changed fields in payload**:

```typescript
// Before
const debt = { id: "1", name: "Old", status: "active", original_amount_cents: 100000 };

// After update (name changed)
const event = {
  entityType: "debt",
  entityId: "1",
  op: "update",
  payload: {
    name: "New", // Only changed field
  },
};
```

**Why**: Smaller events, easier conflict resolution, clearer change history.

## Related Documentation

- **Event Sourcing**: SYNC-ENGINE.md lines 1-200 (event structure)
- **Lamport Clock**: SYNC-ENGINE.md lines 1123-1303 (persistent counter)
- **Idempotency Keys**: debt-implementation.md lines 58-72 (format)
- **Vector Clocks**: SYNC-ENGINE.md lines 365-511 (conflict resolution)
- **Decisions**:
  - #62: Event sourcing from Phase A (simplified LWW)
  - #18: Idempotency persistence (DEBT-DECISIONS.md lines 666-707)

## Technical Stack

- **Dexie.js**: Event storage in IndexedDB
- **nanoid**: Event ID generation
- **TypeScript**: Type-safe events
- **Existing event system**: Reuse transaction event utilities

## Design Patterns

### Event Creation Pattern

```typescript
async function createDebtEvent(
  debt: Debt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<Debt>
): Promise<DebtEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();

  const event: DebtEvent = {
    id: nanoid(),
    entityType: "debt",
    entityId: debt.id,
    op,
    payload: op === "create" ? debt : changedFields!,
    idempotencyKey: `${deviceId}-debt-${debt.id}-${lamportClock}`,
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId: currentUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);
  return event;
}
```

**Why**: Centralized event creation ensures consistent format.

### Integration Pattern

```typescript
// Before: Just CRUD
async function createExternalDebt(data: DebtFormData): Promise<Debt> {
  const debt = { id: nanoid(), ...data };
  await db.debts.add(debt);
  return debt;
}

// After: CRUD + Event
async function createExternalDebt(data: DebtFormData): Promise<Debt> {
  const debt = { id: nanoid(), ...data };

  // 1. Create entity
  await db.debts.add(debt);

  // 2. Create event
  await createDebtEvent(debt, "create");

  return debt;
}
```

**Why**: Minimal changes to existing CRUD, events added as side effect.

### Delta Calculation Pattern

```typescript
function calculateDelta<T extends Record<string, any>>(before: T, after: T): Partial<T> {
  const delta: Partial<T> = {};

  for (const key in after) {
    if (after[key] !== before[key]) {
      delta[key] = after[key];
    }
  }

  return delta;
}

// Usage
const before = { name: "Old", status: "active" };
const after = { name: "New", status: "active" };
const delta = calculateDelta(before, after);
// delta = { name: 'New' }
```

**Why**: Only store changed fields, reduces event size.

## Critical Concepts

**Idempotency Key Reuse**: Payment processing (D5) already generates idempotency keys for debt payments. Event sourcing **reuses these same keys**. This ensures:

- Single idempotency key per operation (not two)
- Payment processing and event sourcing stay in sync
- Server can deduplicate by single key

**Lamport Clock Scoping**: The lamport clock is **global** (not per-entity). Each event increments the global counter. This ensures:

- Strict ordering of local events
- Simple conflict resolution (higher clock wins)
- No need for complex per-entity clocks

**Vector Clock Format**: Vector clocks are **per-device counters**:

```typescript
vectorClock: {
  'device-abc': 42,  // This device's lamport clock
}
```

When merging from another device:

```typescript
vectorClock: {
  'device-abc': 42,  // Device A
  'device-xyz': 38,  // Device B
}
```

**Event vs Entity Timestamps**:

- `event.timestamp`: Unix timestamp of event creation (for ordering)
- `event.created_at`: ISO timestamp of event creation (human-readable)
- `debt.created_at`: ISO timestamp of debt creation (entity lifecycle)
- `debt.updated_at`: ISO timestamp of last update (entity lifecycle)

**Soft Deletes as Update Events**: When archiving a debt (soft delete), generate an `update` event with `{ status: 'archived' }`, NOT a `delete` event. Reserve `delete` events for true deletions (which are prevented in MVP).

## Event Payload Examples

### Debt Create Event

```typescript
{
  id: 'evt-abc123',
  entityType: 'debt',
  entityId: 'debt-1',
  op: 'create',
  payload: {
    household_id: 'h1',
    name: 'Car Loan',
    original_amount_cents: 100000,
    status: 'active',
    created_at: '2025-11-10T10:00:00Z',
    updated_at: '2025-11-10T10:00:00Z',
  },
  idempotencyKey: 'device-abc-debt-debt-1-42',
  lamportClock: 42,
  vectorClock: { 'device-abc': 42 },
  actorUserId: 'user-1',
  deviceId: 'device-abc',
  timestamp: 1731236400000,
  created_at: '2025-11-10T10:00:00Z',
}
```

### Debt Update Event (Name Changed)

```typescript
{
  id: 'evt-def456',
  entityType: 'debt',
  entityId: 'debt-1',
  op: 'update',
  payload: {
    name: 'New Car Loan',  // Only changed field
    updated_at: '2025-11-11T10:00:00Z',
  },
  idempotencyKey: 'device-abc-debt-debt-1-43',
  lamportClock: 43,
  vectorClock: { 'device-abc': 43 },
  actorUserId: 'user-1',
  deviceId: 'device-abc',
  timestamp: 1731322800000,
  created_at: '2025-11-11T10:00:00Z',
}
```

### Debt Payment Create Event

```typescript
{
  id: 'evt-ghi789',
  entityType: 'debt_payment',
  entityId: 'pay-1',
  op: 'create',
  payload: {
    debt_id: 'debt-1',
    transaction_id: 'txn-1',
    amount_cents: 50000,
    payment_date: '2025-11-10',
    is_reversal: false,
    is_overpayment: false,
    device_id: 'device-abc',
    idempotency_key: 'device-abc-debt_payment-pay-1-44',
    created_at: '2025-11-10T11:00:00Z',
    updated_at: '2025-11-10T11:00:00Z',
  },
  idempotencyKey: 'device-abc-debt_payment-pay-1-44', // Same as payment's idempotency_key
  lamportClock: 44,
  vectorClock: { 'device-abc': 44 },
  actorUserId: 'user-1',
  deviceId: 'device-abc',
  timestamp: 1731240000000,
  created_at: '2025-11-10T11:00:00Z',
}
```

### Reversal Create Event

```typescript
{
  id: 'evt-jkl012',
  entityType: 'debt_payment',
  entityId: 'pay-2',
  op: 'create',
  payload: {
    debt_id: 'debt-1',
    transaction_id: 'txn-1',
    amount_cents: -50000,  // Negative
    payment_date: '2025-11-11',
    is_reversal: true,
    reverses_payment_id: 'pay-1',
    device_id: 'device-abc',
    idempotency_key: 'device-abc-debt_payment-pay-2-45',
    created_at: '2025-11-11T11:00:00Z',
    updated_at: '2025-11-11T11:00:00Z',
  },
  idempotencyKey: 'device-abc-debt_payment-pay-2-45',
  lamportClock: 45,
  vectorClock: { 'device-abc': 45 },
  actorUserId: 'user-1',
  deviceId: 'device-abc',
  timestamp: 1731326400000,
  created_at: '2025-11-11T11:00:00Z',
}
```

## Integration Points

### Debt CRUD Operations (D4)

**Operations that generate events**:

- `createExternalDebt()` → `create` event
- `createInternalDebt()` → `create` event
- `updateDebtName()` → `update` event with `{ name }`
- `archiveDebt()` → `update` event with `{ status: 'archived', closed_at }`

### Payment Processing (D5)

**Operations that generate events**:

- `processDebtPayment()` → `create` event for debt_payment

**Idempotency key note**: Payment already generates idempotency key, reuse for event.

### Reversal System (D6)

**Operations that generate events**:

- `reverseDebtPayment()` → `create` event for reversal debt_payment
- `handleTransactionEdit()` → Multiple events (reversal + new payment)
- `handleTransactionDelete()` → `create` event for reversal

## Event Ordering Guarantees

**Local ordering**: Events on single device are strictly ordered by lamport clock:

```
Event 1: lamportClock = 42
Event 2: lamportClock = 43
Event 3: lamportClock = 44
```

**Multi-device ordering**: Events from different devices ordered by vector clock merge:

```
Device A: [42, 43, 44]
Device B: [38, 39]

Merged: Conflict resolution determines final order
```

**Causality**: Events preserve causality:

- Payment event references debt (via debt_id)
- Reversal event references original payment (via reverses_payment_id)
- Update event references entity (via entityId)

## Error Handling

**Event creation failure**: If event creation fails after entity creation:

1. Log error
2. Continue operation (entity already created)
3. Background job will detect missing event and recreate

**Idempotency**: If event with same idempotency key already exists:

1. Skip event creation (idempotent)
2. Return success
3. No duplicate events

**Lamport clock failure**: If lamport clock read/increment fails:

1. Retry up to 3 times
2. If still failing, use fallback: `Date.now()`
3. Log warning for investigation

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
