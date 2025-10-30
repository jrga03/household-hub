# Checkpoint: Event Generation

Run these verifications to ensure everything works correctly.

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/event-generator.test.ts
```

**Expected**: All tests pass

---

## 2. Events Created on Transaction Create ✓

```javascript
// Create transaction
const tx = await createTransaction({
  amount_cents: 50000,
  description: "Checkpoint test",
  type: "expense",
});

// Check Dexie
const events = await db.events.where("entityId").equals(tx.id).toArray();
console.log("Events:", events.length); // Should be 1

// Check event details
const event = events[0];
console.log("Operation:", event.op); // "create"
console.log("Lamport clock:", event.lamportClock); // 1
```

---

## 3. Events Created on Update ✓

```javascript
// Update transaction
await updateTransaction(tx.id, { amount_cents: 60000 });

// Check events
const events = await db.events.where("entityId").equals(tx.id).toArray();
console.log("Events:", events.length); // Should be 2

// Check second event
const updateEvent = events[1];
console.log("Operation:", updateEvent.op); // "update"
console.log("Payload:", updateEvent.payload); // Only changed fields
console.log("Lamport clock:", updateEvent.lamportClock); // 2
```

---

## 4. Events Created on Delete ✓

```javascript
// Delete transaction
await deleteTransaction(tx.id);

// Check events
const events = await db.events.where("entityId").equals(tx.id).toArray();
console.log("Events:", events.length); // Should be 3 (create, update, delete)

// Check delete event
const deleteEvent = events[2];
console.log("Operation:", deleteEvent.op); // "delete"
console.log("Lamport clock:", deleteEvent.lamportClock); // 3
```

---

## 5. Account Events Generated ✓

```javascript
// Create account
const account = await createAccount({
  name: "Test Checking",
  type: "checking",
  initial_balance_cents: 100000,
});

// Check events
const accountEvents = await db.events.where("entityId").equals(account.id).toArray();
console.log("Account events:", accountEvents.length); // Should be 1
console.log("Entity type:", accountEvents[0].entityType); // "account"
console.log("Operation:", accountEvents[0].op); // "create"
```

---

## 6. Category Events Generated ✓

```javascript
// Create category
const category = await createCategory({
  name: "Test Groceries",
  color: "#4CAF50",
});

// Check events
const categoryEvents = await db.events.where("entityId").equals(category.id).toArray();
console.log("Category events:", categoryEvents.length); // Should be 1
console.log("Entity type:", categoryEvents[0].entityType); // "category"
console.log("Operation:", categoryEvents[0].op); // "create"
```

---

## 7. Budget Events Generated ✓

```javascript
// Create budget
const budget = await createBudget({
  category_id: category.id,
  month: "2025-01-01",
  amount_cents: 50000,
});

// Check events
const budgetEvents = await db.events.where("entityId").equals(budget.id).toArray();
console.log("Budget events:", budgetEvents.length); // Should be 1
console.log("Entity type:", budgetEvents[0].entityType); // "budget"
console.log("Operation:", budgetEvents[0].op); // "create"
```

---

## 8. Events in Supabase ✓

Check Supabase Dashboard → transaction_events table:

- [ ] Events visible
- [ ] entity_type correct
- [ ] op values correct (create, update, delete)
- [ ] payload contains data
- [ ] idempotency_key unique
- [ ] lamport_clock increments

---

## 9. Delta Payload Correct ✓

```javascript
const delta = eventGenerator.calculateDelta(
  { amount: 1000, description: "Old" },
  { amount: 2000, description: "Old" }
);

console.log("Delta:", delta); // Should be { amount: 2000 } only
```

---

## Success Criteria

- [ ] All unit tests pass
- [ ] Events created on transaction create/update/delete
- [ ] Events created on account create/update/delete
- [ ] Events created on category create/update/delete
- [ ] Events created on budget create/update/delete
- [ ] Events stored in Dexie
- [ ] Events synced to Supabase
- [ ] household_id included in all events
- [ ] Lamport clock increments per entity
- [ ] Delta payloads contain only changed fields
- [ ] Idempotency keys prevent duplicates

---

## Next Steps

Once all checkpoints pass:

1. Commit event generation code
2. **Milestone 4 (Multi-Device Sync Foundation) COMPLETE!** 🎉
3. Move to **Chunk 031: Vector Clocks** (Phase B - Conflict Resolution)

---

**Estimated Time**: 15 minutes to verify
