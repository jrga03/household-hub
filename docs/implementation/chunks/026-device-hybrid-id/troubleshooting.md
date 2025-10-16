# Troubleshooting: Device Hybrid ID

Common issues and solutions when working with device identification.

---

## Installation Issues

### Problem: FingerprintJS not found

**Symptoms**:

```
Cannot find module '@fingerprintjs/fingerprintjs'
```

**Cause**: Package not installed

**Solution**:

```bash
npm install @fingerprintjs/fingerprintjs
```

Verify installation:

```bash
npm list @fingerprintjs/fingerprintjs
```

---

### Problem: Import errors for FingerprintJS

**Symptoms**:

```typescript
import FingerprintJS from "@fingerprintjs/fingerprintjs";
// Error: Module has no default export
```

**Cause**: Incorrect import syntax

**Solution**:

The correct import is already in the code:

```typescript
import FingerprintJS from "@fingerprintjs/fingerprintjs";
```

If still failing, check `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

---

## Storage Issues

### Problem: IndexedDB device ID not persisting

**Symptoms**:

- Device ID changes on every page load
- Tests fail with "device ID should persist"
- Console shows "IndexedDB device ID lookup failed"

**Cause**: IndexedDB access blocked or meta table missing

**Solution 1**: Check meta table exists

```typescript
// In src/lib/dexie.ts
this.version(N).stores({
  meta: "key",
  // ... other tables
});
```

**Solution 2**: Check browser permissions

1. Open DevTools → Application → IndexedDB
2. Verify "HouseholdHubDB" database exists
3. Check "meta" table visible
4. Try adding test key manually

**Solution 3**: Check for IndexedDB quota errors

```javascript
navigator.storage.estimate().then((estimate) => {
  console.log("Usage:", estimate.usage);
  console.log("Quota:", estimate.quota);
  console.log("Percentage:", (estimate.usage / estimate.quota) * 100, "%");
});
```

If >95%, clear old data or show user warning.

---

### Problem: localStorage not working

**Symptoms**:

- Device ID doesn't survive IndexedDB clear
- Console shows "localStorage is not defined"
- Tests fail on localStorage backup

**Cause**: localStorage blocked by browser settings or private browsing

**Solution 1**: Check if private/incognito mode

localStorage may be disabled in private browsing. Test in normal browser window.

**Solution 2**: Check localStorage availability

```typescript
function isLocalStorageAvailable(): boolean {
  try {
    const test = "__localStorage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
```

Add this check before using localStorage in DeviceManager.

**Solution 3**: Fall back to fingerprint only

If localStorage unavailable, skip to FingerprintJS:

```typescript
async getDeviceId(): Promise<string> {
  if (this.deviceId) return this.deviceId;

  // Try IndexedDB
  try {
    const stored = await db.meta.get("deviceId");
    if (stored?.value) {
      this.deviceId = stored.value;
      return this.deviceId;
    }
  } catch (error) {
    console.warn("IndexedDB failed:", error);
  }

  // Skip localStorage if unavailable
  if (isLocalStorageAvailable()) {
    const localStorageId = localStorage.getItem("deviceId");
    if (localStorageId) {
      this.deviceId = localStorageId;
      await this.storeDeviceId(this.deviceId);
      return this.deviceId;
    }
  }

  // Continue to fingerprint...
}
```

---

## FingerprintJS Issues

### Problem: Fingerprint generation very slow

**Symptoms**:

- First device ID generation takes >5 seconds
- Page appears frozen
- Console shows "Fingerprint loading..."

**Cause**: FingerprintJS analyzing browser characteristics (normal on first load)

**Solution 1**: Show loading indicator

```typescript
async getDeviceId(): Promise<string> {
  if (this.deviceId) return this.deviceId;

  // Show loading state
  const loadingToast = toast.loading("Identifying device...");

  try {
    // ... fingerprint logic
    const deviceId = await this.doFingerprintGeneration();

    toast.dismiss(loadingToast);
    return deviceId;
  } catch (error) {
    toast.dismiss(loadingToast);
    throw error;
  }
}
```

**Solution 2**: Cache aggressively

FingerprintJS result is cached automatically after first generation. Subsequent calls should be fast (<10ms).

**Solution 3**: Preload FingerprintJS

Load FingerprintJS early in app lifecycle:

```typescript
// In App.tsx or main.tsx
useEffect(() => {
  // Preload FingerprintJS
  deviceManager.getDeviceId().catch(console.error);
}, []);
```

---

### Problem: FingerprintJS fails with error

**Symptoms**:

```
Error: Fingerprinting failed
Device ID generated as UUID: xxxxxxxx-xxxx-...
```

**Cause**: FingerprintJS blocked by ad blocker or CSP policy

**Solution 1**: Check Content Security Policy

Add to `index.html` if using strict CSP:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://fpjs.io"
/>
```

**Solution 2**: Handle gracefully

The current implementation already falls back to UUID, which is correct behavior. FingerprintJS failure is acceptable.

**Solution 3**: Document for users

Add note in docs that ad blockers may prevent device fingerprinting, but app will still work (with UUID fallback).

---

## UUID Generation Issues

### Problem: UUID format invalid

**Symptoms**:

```
Expected UUID v4 format, got: abc123
```

**Cause**: UUID generation function not following v4 spec

**Solution**: Verify UUID generation code

```typescript
private generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

Key points:

- 4th group starts with `4` (version 4)
- 5th group starts with `8`, `9`, `a`, or `b` (variant bits)

Test with regex:

```typescript
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
console.log(uuidRegex.test(uuid)); // Should be true
```

---

### Problem: UUID collision (two devices same ID)

**Symptoms**:

- Multiple devices report same device ID
- Vector clock conflicts
- Sync issues

**Cause**: Extremely rare UUID collision (<1 in 10^36 chance) or test data not cleared

**Solution 1**: Clear test data

```typescript
await deviceManager.clearDeviceId();
```

**Solution 2**: Verify UUID generation randomness

```typescript
// Generate 1000 UUIDs and check for duplicates
const uuids = new Set();
for (let i = 0; i < 1000; i++) {
  await deviceManager.clearDeviceId();
  const uuid = await deviceManager.getDeviceId();
  if (uuids.has(uuid)) {
    console.error("Duplicate UUID detected:", uuid);
  }
  uuids.add(uuid);
}
console.log("Generated", uuids.size, "unique UUIDs"); // Should be 1000
```

**Solution 3**: Use crypto.randomUUID() if available

```typescript
private generateUUID(): string {
  // Use native crypto API if available (better randomness)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback to Math.random() implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

---

## Device Detection Issues

### Problem: Browser detected as "Unknown Browser"

**Symptoms**:

```
Browser: Unknown Browser
```

**Cause**: Uncommon user agent string or modified user agent

**Solution**: Add more browser detection rules

```typescript
private detectBrowser(ua: string): string {
  // Order matters - check specific browsers first
  if (ua.includes("Edg")) return "Edge";  // New Edge
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  if (ua.includes("Brave")) return "Brave";

  console.warn("Unknown browser, UA:", ua);
  return "Unknown Browser";
}
```

---

### Problem: OS detected as "Unknown OS"

**Symptoms**:

```
OS: Unknown OS
```

**Cause**: Uncommon or modified user agent

**Solution**: Add more OS detection rules

```typescript
private detectOS(ua: string): string {
  // Mobile first
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";

  // Desktop
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("CrOS")) return "Chrome OS";

  console.warn("Unknown OS, UA:", ua);
  return "Unknown OS";
}
```

---

### Problem: Platform always showing "web" (not PWA)

**Symptoms**:

- Installed as PWA but platform shows "web"
- PWA detection not working

**Cause**: PWA detection logic not matching all scenarios

**Solution**: Check multiple PWA indicators

```typescript
detectPlatform(): DevicePlatform {
  // Check multiple indicators
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone ||
    document.referrer.includes("android-app://");

  if (isStandalone) {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "pwa-ios";
    if (/Android/.test(navigator.userAgent)) return "pwa-android";
    return "pwa-desktop";
  }

  return "web";
}
```

---

## Testing Issues

### Problem: Tests fail with "db.meta.get is not a function"

**Symptoms**:

```
TypeError: db.meta.get is not a function
```

**Cause**: Dexie database not properly initialized in tests

**Solution**: Ensure test setup initializes Dexie

```typescript
// In test file
import { db } from "./dexie";

beforeAll(async () => {
  // Ensure database is open
  await db.open();
});

afterAll(async () => {
  // Cleanup
  await db.delete();
  await db.close();
});
```

---

### Problem: Tests fail due to localStorage mock

**Symptoms**:

```
ReferenceError: localStorage is not defined
```

**Cause**: Node.js test environment doesn't have localStorage

**Solution**: Configure Vitest with jsdom environment

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

Or install localStorage mock:

```bash
npm install --save-dev @types/node
```

```typescript
// In test setup
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
```

---

## Performance Issues

### Problem: Device ID lookup slow after IndexedDB clear

**Symptoms**:

- First load after cache clear takes >1 second
- Subsequent loads are fast

**Cause**: Fingerprint generation on first load (normal behavior)

**Solution**: This is expected. FingerprintJS analyzes browser characteristics which takes time. Use memory cache for subsequent calls:

```typescript
// Already implemented in DeviceManager
if (this.deviceId) return this.deviceId; // Memory cache
```

---

### Problem: Multiple device ID lookups in parallel

**Symptoms**:

- FingerprintJS called multiple times
- Multiple device IDs generated
- Console shows duplicate fingerprint logs

**Cause**: Multiple components calling `getDeviceId()` simultaneously

**Solution**: Add promise caching

```typescript
class DeviceManager {
  private deviceId: string | null = null;
  private deviceIdPromise: Promise<string> | null = null;

  async getDeviceId(): Promise<string> {
    // Return cached
    if (this.deviceId) return this.deviceId;

    // Return in-flight promise
    if (this.deviceIdPromise) return this.deviceIdPromise;

    // Create new promise
    this.deviceIdPromise = this.fetchDeviceId();

    try {
      this.deviceId = await this.deviceIdPromise;
      return this.deviceId;
    } finally {
      this.deviceIdPromise = null;
    }
  }

  private async fetchDeviceId(): Promise<string> {
    // Existing logic here...
  }
}
```

---

## Multi-Tab/Window Issues

### Problem: Different device IDs in different tabs

**Symptoms**:

- Tab 1 shows device ID "abc123"
- Tab 2 shows device ID "xyz789"

**Cause**: Not using singleton instance or race condition

**Solution 1**: Verify singleton export

```typescript
// device-manager.ts
export const deviceManager = new DeviceManager(); // Singleton

// NOT this:
// export default DeviceManager;  // ❌ Would create multiple instances
```

**Solution 2**: Sync across tabs with storage event

```typescript
// In DeviceManager constructor
window.addEventListener("storage", (event) => {
  if (event.key === "deviceId" && event.newValue) {
    this.deviceId = event.newValue;
    console.log("Device ID synced from another tab");
  }
});
```

---

## Prevention Tips

1. **Always use singleton**: Import `deviceManager` instance, never create new instances
2. **Cache aggressively**: Memory cache prevents redundant lookups
3. **Test storage layers**: Verify both IndexedDB and localStorage work
4. **Handle fingerprint failures**: UUID fallback ensures app always works
5. **Log device ID source**: Track which storage layer provided the ID for debugging
6. **Test in private browsing**: Ensure fallback chain works when storage blocked
7. **Monitor performance**: First load may be slow (fingerprint), subsequent loads fast

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Verify all storage layers accessible (IndexedDB, localStorage)
3. Test device ID persistence manually (refresh, cache clear, browser restart)
4. Check browser console for errors
5. Review SYNC-ENGINE.md lines 1125-1305 for original design
6. Check DECISIONS.md #52, #75, #82 for architecture decisions

---

## Quick Fixes

```bash
# Reinstall FingerprintJS
npm uninstall @fingerprintjs/fingerprintjs
npm install @fingerprintjs/fingerprintjs

# Clear all test data
localStorage.clear()
# Then in console:
await db.delete()
await db.open()

# Reset device ID
await deviceManager.clearDeviceId()
await deviceManager.getDeviceId()  // Generate fresh

# Check storage quota
navigator.storage.estimate().then(console.log)
```

---

**Remember**: Device identification is critical infrastructure. When in doubt, test thoroughly across browsers and storage scenarios.
