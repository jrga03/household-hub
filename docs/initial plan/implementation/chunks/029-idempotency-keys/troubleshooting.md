# Troubleshooting: Idempotency Keys

Common issues and solutions.

---

## Key Generation Issues

### Problem: Keys not deterministic

**Solution**: Ensure inputs exactly match:

```typescript
// Correct - same inputs
generateKey("device-abc", "transaction", "tx-123", 1);
generateKey("device-abc", "transaction", "tx-123", 1);

// Incorrect - whitespace difference
generateKey("device-abc ", "transaction", "tx-123", 1); // Extra space
```

---

## Lamport Clock Issues

### Problem: Clock doesn't increment

**Solution**: Verify events stored in Dexie:

```javascript
const events = await db.events.where("entityId").equals("tx-123").toArray();
console.log("Events:", events);
```

If empty, events not being stored (check chunk 030).

---

### Problem: Clock resets unexpectedly

**Solution**: Lamport clocks are per-entity (not global). Different entities have independent clocks:

```javascript
await getNextLamportClock("tx-123"); // 1
await getNextLamportClock("tx-456"); // 1 (different entity)
```

---

## Checksum Issues

### Problem: Checksums don't match for same payload

**Solution**: Ensure payload normalized (key order, timestamps removed):

```typescript
// These should produce same checksum:
calculateChecksum({ amount: 1000, description: "Test" });
calculateChecksum({ description: "Test", amount: 1000 }); // Different key order
```

---

### Problem: "crypto.subtle is not defined"

**Solution**: Web Crypto API requires HTTPS or localhost. Use http://localhost:3000 (not IP address).

---

## Quick Fixes

```bash
# Reinstall dependencies
npm install

# Clear Dexie database
# In console:
await db.delete()
await db.open()

# Run tests
npm test src/lib/idempotency.test.ts
```

---

**Remember**: Idempotency keys prevent duplicate events. Test thoroughly!
