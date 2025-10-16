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

## 4. Events in Supabase ✓

Check Supabase Dashboard → transaction_events table:

- [ ] Events visible
- [ ] entity_type correct
- [ ] op values correct (create, update, delete)
- [ ] payload contains data
- [ ] idempotency_key unique
- [ ] lamport_clock increments

---

## 5. Delta Payload Correct ✓

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
- [ ] Events created on transaction create
- [ ] Events created on transaction update
- [ ] Events created on transaction delete
- [ ] Events stored in Dexie
- [ ] Events synced to Supabase
- [ ] Lamport clock increments per entity
- [ ] Delta payloads contain only changed fields
- [ ] Idempotency keys prevent duplicates

---

## Next Steps

Once all checkpoints pass:

1. Commit event generation code
2. **Milestone 4 (Device & Events) COMPLETE!** 🎉
3. Move to **Chunk 031: Vector Clocks** (Phase B - Conflict Resolution)

---

**Estimated Time**: 15 minutes to verify
