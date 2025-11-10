# D10 Verification: Event Sourcing Integration

## Quick Verification (3 minutes)

```bash
npm run dev
# Create debt, make payment, update name
# Check events table in IndexedDB DevTools
```

---

## Part 1: Event Creation for Debts

### Create Event Generated

```typescript
import { createExternalDebt, getDebtEvents } from "@/lib/debts";

// Create debt
const debt = await createExternalDebt({
  name: "Test Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Verify event created
const events = await getDebtEvents(debt.id, "external");

console.assert(events.length === 1, "One event created");
console.assert(events[0].op === "create", "Operation is create");
console.assert(events[0].entityType === "debt", "Entity type is debt");
console.assert(events[0].entityId === debt.id, "Entity ID matches");
console.assert(events[0].payload.name === "Test Debt", "Payload contains debt data");
```

### Update Event Generated (Name Change)

```typescript
import { updateDebtName } from '@/lib/debts';

// Create debt
const debt = await createExternalDebt({...});

// Update name
await updateDebtName(debt.id, 'external', 'New Name');

// Verify update event
const events = await getDebtEvents(debt.id, 'external');

console.assert(events.length === 2, 'Two events exist');
console.assert(events[1].op === 'update', 'Second event is update');
console.assert(events[1].payload.name === 'New Name', 'Payload has new name');
console.assert(events[1].payload.original_amount_cents === undefined, 'Delta only (no unchanged fields)');
```

### Archive Event Generated

```typescript
import { archiveDebt } from '@/lib/debts';

// Create debt
const debt = await createExternalDebt({...});

// Archive debt
await archiveDebt(debt.id, 'external');

// Verify archive event
const events = await getDebtEvents(debt.id, 'external');

console.assert(events.length === 2, 'Create + Archive events');
console.assert(events[1].op === 'update', 'Archive is update operation');
console.assert(events[1].payload.status === 'archived', 'Status changed');
console.assert(events[1].payload.closed_at !== undefined, 'Closed timestamp set');
```

---

## Part 2: Event Creation for Payments

### Payment Event Generated

```typescript
import { processDebtPayment, getPaymentEvents } from '@/lib/debts';

// Create debt
const debt = await createExternalDebt({...});

// Make payment
const result = await processDebtPayment({
  transaction_id: 'txn-1',
  amount_cents: 50000,
  payment_date: '2025-11-10',
  debt_id: debt.id,
  household_id: 'h1',
});

// Verify payment event
const events = await getPaymentEvents(result.payment.id);

console.assert(events.length === 1, 'Payment event created');
console.assert(events[0].entityType === 'debt_payment', 'Entity type correct');
console.assert(events[0].op === 'create', 'Operation is create');
console.assert(events[0].payload.amount_cents === 50000, 'Payload contains payment');
```

### Reversal Event Generated

```typescript
import { reverseDebtPayment } from '@/lib/debts';

// Create payment
const payment = await processDebtPayment({...});

// Reverse payment
const result = await reverseDebtPayment({ payment_id: payment.payment.id });

// Verify reversal event
const events = await getPaymentEvents(result.reversal.id);

console.assert(events.length === 1, 'Reversal event created');
console.assert(events[0].payload.is_reversal === true, 'Marked as reversal');
console.assert(events[0].payload.amount_cents === -50000, 'Negative amount');
console.assert(events[0].payload.reverses_payment_id === payment.payment.id, 'Links to original');
```

---

## Part 3: Idempotency Keys

### Unique Keys Per Operation

```typescript
// Create debt
const debt = await createExternalDebt({...});

// Get event
const events = await getDebtEvents(debt.id, 'external');
const event1 = events[0];

// Update debt
await updateDebtName(debt.id, 'external', 'New');

// Get update event
const allEvents = await getDebtEvents(debt.id, 'external');
const event2 = allEvents[1];

// Verify different keys
console.assert(event1.idempotencyKey !== event2.idempotencyKey, 'Different keys');
console.assert(event1.lamportClock < event2.lamportClock, 'Clock incremented');
```

### Payment Idempotency Key Reused

```typescript
// Make payment
const result = await processDebtPayment({...});

// Get payment event
const events = await getPaymentEvents(result.payment.id);

// Verify same key
console.assert(
  events[0].idempotencyKey === result.payment.idempotency_key,
  'Event reuses payment idempotency key'
);
```

### Idempotency Check Works

```typescript
import { eventExists } from '@/lib/debts/events';

// Create debt
const debt = await createExternalDebt({...});

// Get event key
const events = await getDebtEvents(debt.id, 'external');
const key = events[0].idempotencyKey;

// Check existence
const exists = await eventExists(key);
console.assert(exists === true, 'Event exists');

// Check non-existent
const notExists = await eventExists('nonexistent-key');
console.assert(notExists === false, 'Non-existent returns false');
```

---

## Part 4: Lamport Clock Ordering

### Events Strictly Ordered

```typescript
// Create multiple operations
const debt = await createExternalDebt({...});
await updateDebtName(debt.id, 'external', 'Name 1');
await updateDebtName(debt.id, 'external', 'Name 2');
await archiveDebt(debt.id, 'external');

// Get all events
const events = await getDebtEvents(debt.id, 'external');

// Verify ordering
console.assert(events.length === 4, 'Four events');
console.assert(events[0].lamportClock < events[1].lamportClock);
console.assert(events[1].lamportClock < events[2].lamportClock);
console.assert(events[2].lamportClock < events[3].lamportClock);

// Verify operations in order
console.assert(events[0].op === 'create');
console.assert(events[1].op === 'update');
console.assert(events[2].op === 'update');
console.assert(events[3].op === 'update');
```

### Cross-Entity Ordering

```typescript
// Create debt
const debt1 = await createExternalDebt({
  name: "Debt 1",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Create payment
const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  debt_id: debt1.id,
  payment_date: "2025-11-10",
  household_id: "h1",
});

// Create another debt
const debt2 = await createExternalDebt({
  name: "Debt 2",
  original_amount_cents: 200000,
  household_id: "h1",
});

// Get all events
const debtEvents1 = await getDebtEvents(debt1.id, "external");
const paymentEvents = await getPaymentEvents(payment.payment.id);
const debtEvents2 = await getDebtEvents(debt2.id, "external");

// Verify clocks strictly increase
console.assert(
  debtEvents1[0].lamportClock < paymentEvents[0].lamportClock,
  "Debt 1 before payment"
);
console.assert(
  paymentEvents[0].lamportClock < debtEvents2[0].lamportClock,
  "Payment before debt 2"
);
```

---

## Part 5: Delta Calculation

### calculateDelta Function

```typescript
import { calculateDelta } from "@/lib/debts/events";

// Test with objects
const before = {
  name: "Old Name",
  status: "active" as const,
  amount: 100,
  unchanged: "value",
};

const after = {
  name: "New Name",
  status: "archived" as const,
  amount: 100,
  unchanged: "value",
};

const delta = calculateDelta(before, after);

// Verify only changed fields
console.assert(Object.keys(delta).length === 2, "Two fields changed");
console.assert(delta.name === "New Name", "Name in delta");
console.assert(delta.status === "archived", "Status in delta");
console.assert(delta.amount === undefined, "Unchanged not in delta");
console.assert(delta.unchanged === undefined, "Unchanged not in delta");
```

### Update Events Contain Delta Only

```typescript
// Create debt
const debt = await createExternalDebt({
  name: "Original",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Update name
await updateDebtName(debt.id, "external", "Updated");

// Get update event
const events = await getDebtEvents(debt.id, "external");
const updateEvent = events[1];

// Verify delta only
const payloadKeys = Object.keys(updateEvent.payload);
console.assert(payloadKeys.includes("name"), "Name in payload");
console.assert(payloadKeys.includes("updated_at"), "Updated_at in payload");
console.assert(!payloadKeys.includes("original_amount_cents"), "Unchanged field not in payload");
console.assert(!payloadKeys.includes("household_id"), "Unchanged field not in payload");
```

---

## Part 6: Vector Clocks

### Single Device Vector Clock

```typescript
// Create debt
const debt = await createExternalDebt({...});

// Get event
const events = await getDebtEvents(debt.id, 'external');
const event = events[0];

// Verify vector clock
console.assert(typeof event.vectorClock === 'object', 'Vector clock is object');
const deviceIds = Object.keys(event.vectorClock);
console.assert(deviceIds.length === 1, 'One device in vector clock');
console.assert(event.vectorClock[deviceIds[0]] === event.lamportClock, 'Vector clock matches lamport');
```

---

## Part 7: Event Metadata

### Actor User ID

```typescript
// Create debt
const debt = await createExternalDebt({...});

// Get event
const events = await getDebtEvents(debt.id, 'external');
const event = events[0];

// Verify actor
console.assert(typeof event.actorUserId === 'string', 'Actor user ID is string');
console.assert(event.actorUserId.length > 0, 'Actor user ID not empty');
```

### Device ID

```typescript
import { getDeviceId } from '@/lib/device';

// Get current device ID
const deviceId = await getDeviceId();

// Create debt
const debt = await createExternalDebt({...});

// Get event
const events = await getDebtEvents(debt.id, 'external');

// Verify device ID matches
console.assert(events[0].deviceId === deviceId, 'Event has correct device ID');
```

### Timestamps

```typescript
// Record time before
const before = Date.now();

// Create debt
const debt = await createExternalDebt({...});

// Record time after
const after = Date.now();

// Get event
const events = await getDebtEvents(debt.id, 'external');
const event = events[0];

// Verify timestamp in range
console.assert(event.timestamp >= before, 'Timestamp after start');
console.assert(event.timestamp <= after, 'Timestamp before end');

// Verify created_at is ISO string
console.assert(typeof event.created_at === 'string', 'created_at is string');
console.assert(event.created_at.includes('T'), 'created_at is ISO format');
```

---

## Part 8: Event Query Helpers

### getDebtEvents

```typescript
import { getDebtEvents } from '@/lib/debts';

// Create debt with operations
const debt = await createExternalDebt({...});
await updateDebtName(debt.id, 'external', 'New');
await archiveDebt(debt.id, 'external');

// Get events
const events = await getDebtEvents(debt.id, 'external');

// Verify
console.assert(events.length === 3, 'All events returned');
console.assert(events[0].lamportClock < events[1].lamportClock, 'Sorted by lamport');
console.assert(events[1].lamportClock < events[2].lamportClock, 'Sorted by lamport');
```

### getPaymentEvents

```typescript
import { getPaymentEvents } from '@/lib/debts';

// Make payment
const result = await processDebtPayment({...});

// Get events
const events = await getPaymentEvents(result.payment.id);

// Verify
console.assert(events.length === 1, 'Payment event returned');
console.assert(events[0].entityId === result.payment.id, 'Correct entity');
```

### getDebtEventsInRange

```typescript
import { getDebtEventsInRange } from '@/lib/debts';

// Record start time
const start = Date.now();

// Create operations
const debt = await createExternalDebt({...});
await processDebtPayment({ debt_id: debt.id, amount_cents: 50000, ... });

// Record end time
const end = Date.now();

// Get events in range
const events = await getDebtEventsInRange(start, end);

// Verify
console.assert(events.length >= 2, 'At least 2 events in range');
console.assert(events.some(e => e.entityType === 'debt'), 'Debt event included');
console.assert(events.some(e => e.entityType === 'debt_payment'), 'Payment event included');
```

---

## Part 9: Complete Workflow

### Full Lifecycle Events

```typescript
// 1. Create debt
const debt = await createExternalDebt({
  name: "Complete Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

// 2. Make payment
const payment1 = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 30000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// 3. Make another payment
const payment2 = await processDebtPayment({
  transaction_id: "txn-2",
  amount_cents: 50000,
  payment_date: "2025-11-11",
  debt_id: debt.id,
  household_id: "h1",
});

// 4. Update name
await updateDebtName(debt.id, "external", "Updated Complete Test");

// 5. Reverse second payment
const reversal = await reverseDebtPayment({ payment_id: payment2.payment.id });

// 6. Archive debt
await archiveDebt(debt.id, "external");

// Get all debt events
const debtEvents = await getDebtEvents(debt.id, "external");

// Verify: create + update + archive = 3
console.assert(debtEvents.length === 3, "All debt events present");

// Get all payment events
const payment1Events = await getPaymentEvents(payment1.payment.id);
const payment2Events = await getPaymentEvents(payment2.payment.id);
const reversalEvents = await getPaymentEvents(reversal.reversal.id);

// Verify: 1 + 1 + 1 = 3
console.assert(payment1Events.length === 1, "Payment 1 event");
console.assert(payment2Events.length === 1, "Payment 2 event");
console.assert(reversalEvents.length === 1, "Reversal event");

// Total events: 3 debt + 3 payment = 6
const allEvents = await db.events.toArray();
const debtRelatedEvents = allEvents.filter(
  (e) =>
    e.entityId === debt.id ||
    e.entityId === payment1.payment.id ||
    e.entityId === payment2.payment.id ||
    e.entityId === reversal.reversal.id
);

console.assert(debtRelatedEvents.length === 6, "Total 6 events");
```

---

## Part 10: IndexedDB Inspection

### Browser DevTools Verification

```bash
# Open Chrome DevTools → Application → IndexedDB → household-hub → events

# Verify event structure:
{
  id: "evt-...",
  entityType: "debt",
  entityId: "debt-...",
  op: "create",
  payload: { name: "...", original_amount_cents: 100000, ... },
  idempotencyKey: "device-...-debt-...-42",
  lamportClock: 42,
  vectorClock: { "device-...": 42 },
  actorUserId: "user-1",
  deviceId: "device-...",
  timestamp: 1731236400000,
  created_at: "2025-11-10T10:00:00.000Z"
}
```

### Event Count Check

```typescript
// Create known number of operations
const debt1 = await createExternalDebt({...});
const debt2 = await createExternalDebt({...});
await updateDebtName(debt1.id, 'external', 'New');
await processDebtPayment({ debt_id: debt1.id, ... });

// Count events
const allEvents = await db.events.toArray();
const debtEvents = allEvents.filter(e => e.entityType.includes('debt'));

// Expected: 2 creates + 1 update + 1 payment = 4
console.assert(debtEvents.length === 4, 'Expected event count');
```

---

## Edge Cases

### Edge Case 1: Rapid Sequential Operations

```typescript
// Create debt and immediately update multiple times
const debt = await createExternalDebt({...});
await updateDebtName(debt.id, 'external', 'Name 1');
await updateDebtName(debt.id, 'external', 'Name 2');
await updateDebtName(debt.id, 'external', 'Name 3');

// Get events
const events = await getDebtEvents(debt.id, 'external');

// Verify all events captured
console.assert(events.length === 4, 'All rapid updates captured');

// Verify lamport clocks strictly increase
for (let i = 1; i < events.length; i++) {
  console.assert(
    events[i].lamportClock > events[i - 1].lamportClock,
    `Event ${i} clock higher than ${i - 1}`
  );
}
```

### Edge Case 2: Event for Reversal of Reversal

```typescript
// Create payment
const payment = await processDebtPayment({...});

// Reverse payment
const reversal1 = await reverseDebtPayment({ payment_id: payment.payment.id });

// Reverse the reversal
const reversal2 = await reverseDebtPayment({ payment_id: reversal1.reversal.id });

// Get events
const rev2Events = await getPaymentEvents(reversal2.reversal.id);

// Verify
console.assert(rev2Events.length === 1, 'Reversal of reversal has event');
console.assert(rev2Events[0].payload.is_reversal === true, 'Marked as reversal');
console.assert(rev2Events[0].payload.amount_cents > 0, 'Positive amount (double negative)');
```

### Edge Case 3: Multiple Debts Same Name (Different Households)

```typescript
// Create same-named debts in different households
const debt1 = await createExternalDebt({
  name: "Same Name",
  original_amount_cents: 100000,
  household_id: "h1",
});

const debt2 = await createExternalDebt({
  name: "Same Name",
  original_amount_cents: 200000,
  household_id: "h2",
});

// Get events
const events1 = await getDebtEvents(debt1.id, "external");
const events2 = await getDebtEvents(debt2.id, "external");

// Verify separate events
console.assert(events1.length === 1, "Debt 1 has event");
console.assert(events2.length === 1, "Debt 2 has event");
console.assert(events1[0].entityId === debt1.id, "Event 1 for debt 1");
console.assert(events2[0].entityId === debt2.id, "Event 2 for debt 2");
console.assert(events1[0].idempotencyKey !== events2[0].idempotencyKey, "Different keys");
```

---

## Final Checklist

- [ ] Debt create generates event
- [ ] Debt update generates event with delta
- [ ] Debt archive generates update event
- [ ] Payment create generates event
- [ ] Reversal create generates event
- [ ] Idempotency keys unique per operation
- [ ] Payment event reuses payment idempotency key
- [ ] Lamport clock strictly increases
- [ ] Events ordered by lamport clock
- [ ] Vector clocks include device ID
- [ ] Delta calculation works (only changed fields)
- [ ] Event metadata correct (actor, device, timestamp)
- [ ] getDebtEvents returns all events for debt
- [ ] getPaymentEvents returns payment events
- [ ] getDebtEventsInRange filters by time
- [ ] Complete workflow generates expected events
- [ ] IndexedDB contains all events
- [ ] Event count matches operation count

**Status**: ✅ Chunk D10 Complete

**Next Chunk**: D11 - Sync Queue Integration
