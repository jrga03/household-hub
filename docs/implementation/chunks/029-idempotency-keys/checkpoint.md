# Checkpoint: Idempotency Keys

Run these verifications to ensure everything works correctly.

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/idempotency.test.ts
```

**Expected**: All tests pass (~20 tests)

---

## 2. Key Generation Deterministic ✓

```javascript
const key1 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);
const key2 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);

console.log("Keys match:", key1 === key2); // Should be true
console.log("Format:", key1); // "device-abc-transaction-tx-123-1"
```

---

## 3. Lamport Clock Increments ✓

```javascript
const clock1 = await idempotencyGenerator.getNextLamportClock("new-entity");
console.log("First clock:", clock1); // Should be 1

// Simulate adding event
await db.events.add({
  id: "test",
  entityId: "new-entity",
  lamportClock: 1,
  /* ... other fields */
});

const clock2 = await idempotencyGenerator.getNextLamportClock("new-entity");
console.log("Second clock:", clock2); // Should be 2
```

---

## 4. Checksum Consistent ✓

```javascript
const payload = { amount: 1000, description: "Test" };

const checksum1 = await idempotencyGenerator.calculateChecksum(payload);
const checksum2 = await idempotencyGenerator.calculateChecksum(payload);

console.log("Checksums match:", checksum1 === checksum2); // true
console.log("Length:", checksum1.length); // 64 (SHA-256 hex)
```

---

## 5. Vector Clock Operations ✓

```javascript
// Initialize
const clock = idempotencyGenerator.initVectorClock("device-abc");
console.log("Initial:", clock); // { "device-abc": 1 }

// Update
const updated = idempotencyGenerator.updateVectorClock(clock, "device-abc");
console.log("Updated:", updated); // { "device-abc": 2 }

// Add device
const multi = idempotencyGenerator.updateVectorClock(updated, "device-xyz");
console.log("Multi-device:", multi); // { "device-abc": 2, "device-xyz": 1 }
```

---

## Success Criteria

- [ ] All unit tests pass
- [ ] Key generation is deterministic
- [ ] Lamport clock increments per entity
- [ ] Checksums consistent for same payload
- [ ] Vector clock initialization works
- [ ] Vector clock updates correctly
- [ ] Type checking passes

---

## Next Steps

1. Delete test route
2. Commit idempotency code
3. Move to **Chunk 030: Event Generation**
