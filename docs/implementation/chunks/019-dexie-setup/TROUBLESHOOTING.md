# Troubleshooting: Dexie Setup

---

## Problem: "Failed to open database" error

**Cause**: IndexedDB blocked or corrupted

**Solution**:

1. Check if IndexedDB is available:

   ```javascript
   console.log("IndexedDB available:", !!window.indexedDB);
   ```

2. Check browser privacy settings (some browsers block in private mode)

3. Delete and recreate:
   ```javascript
   await db.delete();
   await db.open();
   ```

---

## Problem: Device ID changes every time

**Cause**: Storage not persisting

**Solution**:

1. Check localStorage is enabled
2. Check IndexedDB permissions
3. Verify storeDeviceId is called:
   ```typescript
   console.log("Storing device ID:", deviceId);
   await db.meta.put({ key: "deviceId", value: deviceId });
   localStorage.setItem("deviceId", deviceId);
   ```

---

## Problem: FingerprintJS fails

**Cause**: Library not loaded or blocked by ad blocker

**Solution**:

1. Check library loaded:

   ```javascript
   console.log("FingerprintJS:", typeof FingerprintJS);
   ```

2. Fallback to UUID will work (nanoid)

---

## Problem: Schema version errors

**Cause**: Trying to downgrade version

**Solution**: NEVER decrease version number. Only increment:

```typescript
// ❌ Wrong:
this.version(2).stores(...);
this.version(1).stores(...); // ERROR

// ✅ Correct:
this.version(1).stores(...);
this.version(2).stores(...);
```

---

## Problem: Data not persisting

**Cause**: Transaction not completing

**Solution**: Ensure async operations complete:

```typescript
await db.transactions.add(data); // Wait for completion
```

---

## Quick Fixes

```javascript
// Clear all data
await db.delete();
await db.open();

// Reset device ID
await deviceManager.clearDeviceId();

// Check what's stored
await db.transactions.toArray();
```
