# Troubleshooting: Event Generation

Common issues and solutions.

---

## Event Creation Issues

### Problem: Events not created

**Solution**: Check userId provided:

```typescript
const userId = useAuthStore.getState().user?.id;
if (!userId) throw new Error("Not authenticated");
```

---

### Problem: Duplicate events

**Solution**: Idempotency key should prevent this. Check key generation:

```javascript
const key = idempotencyGenerator.generateKey(deviceId, entityType, entityId, lamportClock);
console.log("Key:", key);
```

---

### Problem: Events not in Supabase

**Solution**: Check network. Events stored in Dexie first, then synced:

```javascript
// Check Dexie
const dexieEvents = await db.events.toArray();
console.log("Dexie:", dexieEvents.length);

// Check Supabase
const { data } = await supabase.from("transaction_events").select("count");
console.log("Supabase:", data);
```

---

## Delta Calculation Issues

### Problem: Delta includes all fields

**Solution**: Ensure calculateDelta only returns changed fields:

```typescript
function calculateDelta(oldValue: any, newValue: any): any {
  const delta: any = {};
  for (const key in newValue) {
    if (newValue[key] !== oldValue[key]) {
      // Only add if different
      delta[key] = newValue[key];
    }
  }
  return delta;
}
```

---

## Household ID Issues

### Problem: household_id missing in events

**Solution**: Ensure event creation includes household_id:

```typescript
const event: TransactionEvent = {
  // ...
  householdId: "00000000-0000-0000-0000-000000000001", // MVP default
  // ...
};
```

Also verify Supabase insert includes the field:

```typescript
await supabase.from("transaction_events").insert({
  id: event.id,
  household_id: event.householdId, // Must be included
  // ... rest of fields
});
```

---

## Entity-Specific Event Issues

### Problem: Account/category/budget events not generated

**Solution**: Ensure all entity CRUD functions call event generators:

```typescript
// After createAccount
await createAccountEvent("create", account.id, account, userId);

// After createCategory
await createCategoryEvent("create", category.id, category, userId);

// After createBudget
await createBudgetEvent("create", budget.id, budget, userId);
```

### Problem: Import errors for eventGenerator

**Solution**: Import both helper and class:

```typescript
import { createTransactionEvent, eventGenerator } from "./event-generator";
```

The `eventGenerator` class instance is needed for `calculateDelta()`.

---

## Vector Clock Issues

### Problem: Vector clock query returns wrong event

**Solution**: Use explicit sort by lamportClock:

```typescript
const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock"); // Explicit sort

const latestEvent = events[events.length - 1]; // Last = latest
```

---

## Quick Fixes

```bash
# Run tests
npm test src/lib/event-generator.test.ts

# Check Dexie events
# In console:
await db.events.toArray()

# Check Supabase events
const { data } = await supabase.from('transaction_events').select('*');
console.log(data);
```

---

**Remember**: Event generation completes the event sourcing foundation!
