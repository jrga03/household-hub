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
