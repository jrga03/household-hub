# Checkpoint: Device Hybrid ID

Run these verifications to ensure everything works correctly.

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/device-manager.test.ts
```

**Expected**:

```
✓ DeviceManager
  ✓ getDeviceId (6 tests)
  ✓ Device Detection (3 tests)
  ✓ Device ID Utilities (3 tests)
  ✓ UUID Generation (1 test)

Test Files  1 passed (1)
     Tests  13 passed (13)
```

All tests should pass with no failures or warnings.

---

## 2. Type Checking Passes ✓

```bash
npm run type-check
```

**Expected**: No TypeScript errors in:

- `src/lib/device-manager.ts`
- `src/lib/device-manager.test.ts`
- `src/types/device.ts`

---

## 3. Device ID Persists Across Page Refreshes ✓

**Test Case 1: Normal refresh**

1. Visit test page: http://localhost:3000/test-device
2. Note the Device ID (e.g., `abc123xyz`)
3. Refresh the page (⌘+R / Ctrl+R)
4. **Expected**: Device ID remains the same

---

## 4. Device ID Survives IndexedDB Deletion ✓

**Test Case 2: IndexedDB cleared**

1. Note your current Device ID
2. Open DevTools → Application → IndexedDB
3. Find "HouseholdHubDB" → "meta" table
4. Delete the "deviceId" key
5. Refresh the page
6. **Expected**: Device ID still the same (loaded from localStorage backup)

---

## 5. Device ID Survives Cache Clear ✓

**Test Case 3: Full cache clear**

1. Note your current Device ID
2. Open DevTools → Application
3. Click "Clear storage" → "Clear site data"
4. Refresh the page
5. **Expected**:
   - If FingerprintJS works: Same device ID (from fingerprint)
   - If FingerprintJS fails: New device ID (UUID fallback)

---

## 6. Redundant Storage Works ✓

**Test Case 4: Verify dual storage**

Open DevTools Console and run:

```javascript
// Get device ID
const deviceId = await deviceManager.getDeviceId();
console.log("Device ID:", deviceId);

// Check IndexedDB
const dbValue = await db.meta.get("deviceId");
console.log("IndexedDB value:", dbValue?.value);

// Check localStorage
const lsValue = localStorage.getItem("deviceId");
console.log("localStorage value:", lsValue);

// All three should match
console.log("All match:", deviceId === dbValue?.value && deviceId === lsValue);
```

**Expected**: All three values should be identical, "All match: true"

---

## 7. Device Detection Works ✓

Open DevTools Console:

```javascript
const info = await deviceManager.getDeviceInfo();
console.log("Device Info:", info);
```

**Expected Output**:

```javascript
{
  id: "abc123xyz...",
  name: "Chrome on macOS",  // Or your actual browser/OS
  platform: "web",  // Or "pwa-ios", "pwa-android", "pwa-desktop"
  fingerprint: "abc123xyz...",
  browser: "Chrome",
  os: "macOS",
  lastSeen: "2025-01-15T..."
}
```

**Visual checks**:

- [ ] `name` format is "{Browser} on {OS}"
- [ ] `platform` is one of: "web", "pwa-ios", "pwa-android", "pwa-desktop"
- [ ] `browser` detected correctly
- [ ] `os` detected correctly
- [ ] `lastSeen` is recent timestamp

---

## 8. Clear Device ID Works ✓

Open DevTools Console:

```javascript
// Has device ID
console.log("Has device ID:", await deviceManager.hasDeviceId()); // true

// Clear it
await deviceManager.clearDeviceId();

// Should be cleared
console.log("Has device ID:", await deviceManager.hasDeviceId()); // false

// Verify storage cleared
console.log("IndexedDB:", await db.meta.get("deviceId")); // undefined
console.log("localStorage:", localStorage.getItem("deviceId")); // null

// Generate new device ID
const newId = await deviceManager.getDeviceId();
console.log("New device ID:", newId);
```

**Expected**:

1. `hasDeviceId()` returns `true` initially
2. After `clearDeviceId()`, returns `false`
3. IndexedDB returns `undefined`
4. localStorage returns `null`
5. New device ID generated successfully

---

## 9. UUID Format Valid ✓

If FingerprintJS unavailable (e.g., ad blocker), UUID should be generated:

```javascript
// Force UUID generation by clearing and blocking FingerprintJS
await deviceManager.clearDeviceId();

// Mock FingerprintJS failure (in test environment)
// In production, disable FingerprintJS temporarily

const deviceId = await deviceManager.getDeviceId();
console.log("Device ID:", deviceId);

// Check UUID v4 format
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
console.log("Valid UUID v4:", uuidRegex.test(deviceId));
```

**Expected**: "Valid UUID v4: true"

---

## 10. Memory Cache Works ✓

Performance test:

```javascript
// First call (may involve fingerprint)
console.time("First call");
await deviceManager.getDeviceId();
console.timeEnd("First call");

// Second call (should use memory cache)
console.time("Second call");
await deviceManager.getDeviceId();
console.timeEnd("Second call");
```

**Expected**:

- First call: 1-300ms (depending on storage/fingerprint)
- Second call: <1ms (memory cache)

---

## 11. Multiple Tabs Share Device ID ✓

**Test Case 5: Multi-tab consistency**

1. Open test page in Tab 1
2. Note the Device ID
3. Open same page in Tab 2
4. **Expected**: Both tabs show same Device ID

---

## 12. Browser Restart Persistence ✓

**Test Case 6: Browser restart (manual)**

1. Note your Device ID
2. Close the browser completely (Quit, not just close tab)
3. Reopen the browser
4. Visit test page again
5. **Expected**: Device ID should be the same (from IndexedDB)

---

## Success Criteria

- [ ] All 13+ unit tests pass
- [ ] Type checking passes with no errors
- [ ] Device ID persists across page refreshes
- [ ] Device ID survives IndexedDB deletion (localStorage backup)
- [ ] Device ID survives cache clear (fingerprint or UUID)
- [ ] Redundant storage in IndexedDB + localStorage verified
- [ ] Device name/platform detection accurate
- [ ] Clear device ID works correctly
- [ ] UUID generation format valid
- [ ] Memory cache improves performance
- [ ] Multiple tabs share same device ID
- [ ] Device ID persists after browser restart

---

## Common Issues

### Issue: Tests fail with "db.meta is not a function"

**Solution**: Ensure Dexie database has `meta` table (chunk 019):

```typescript
// In dexie.ts
this.version(1).stores({
  // ... other tables
  meta: "key",
});
```

### Issue: FingerprintJS not loading

**Solution**: Check installation:

```bash
npm list @fingerprintjs/fingerprintjs
```

If not found:

```bash
npm install @fingerprintjs/fingerprintjs
```

### Issue: Device ID changes on every page load

**Solution**: Check storage is working:

1. Verify IndexedDB permissions
2. Check localStorage not blocked
3. Inspect DevTools Console for errors

### Issue: UUID format test fails

**Solution**: Check UUID regex matches v4 format:

- Version digit (4th group): `4`
- Variant digit (5th group): `8`, `9`, `a`, or `b`

### Issue: Device ID different across tabs

**Solution**:

- Ensure using singleton: `export const deviceManager = new DeviceManager();`
- Both tabs must import from same instance
- Check localStorage isn't disabled

---

## Next Steps

Once all checkpoints pass:

1. Delete test route (`src/routes/test-device.tsx`)
2. Commit device manager code
3. Move to **Chunk 027: Devices Table** (device registration in Supabase)

---

**Estimated Time**: 15-20 minutes to verify all checkpoints
