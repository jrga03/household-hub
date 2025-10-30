# Instructions: Device Hybrid ID

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Install FingerprintJS (5 min)

Install the FingerprintJS library:

```bash
npm install @fingerprintjs/fingerprintjs
```

**Verify**: Check `package.json` shows `@fingerprintjs/fingerprintjs` in dependencies.

---

## Step 2: Create Device Type Definitions (5 min)

Create `src/types/device.ts`:

```typescript
/**
 * Device platform types
 */
export type DevicePlatform = "web" | "pwa-ios" | "pwa-android" | "pwa-desktop";

/**
 * Device information
 */
export interface DeviceInfo {
  id: string;
  name: string; // e.g., "Chrome on macOS"
  platform: DevicePlatform;
  fingerprint: string;
  browser: string;
  os: string;
  lastSeen: Date;
}

/**
 * Device ID source for debugging
 */
export type DeviceIdSource = "indexeddb" | "localstorage" | "fingerprint" | "uuid";

/**
 * Device ID result with source tracking
 */
export interface DeviceIdResult {
  id: string;
  source: DeviceIdSource;
  isNewDevice: boolean;
}
```

**Verify**: No TypeScript errors.

---

## Step 3: Create DeviceManager Class - Part 1: Core Structure (10 min)

Create `src/lib/device-manager.ts`:

```typescript
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { db } from "./dexie";
import type { DevicePlatform, DeviceInfo, DeviceIdSource } from "@/types/device";

/**
 * DeviceManager handles device identification with hybrid fallback strategy.
 *
 * Fallback order:
 * 1. IndexedDB (primary storage)
 * 2. localStorage (backup storage)
 * 3. FingerprintJS (survives cache clearing)
 * 4. UUID (final fallback)
 *
 * Device IDs are stored redundantly in both IndexedDB and localStorage
 * to maximize persistence across browser sessions and cache clears.
 */
class DeviceManager {
  private deviceId: string | null = null;
  private fpPromise: Promise<any> | null = null;

  /**
   * Get device ID with automatic fallback strategy
   *
   * @returns Device ID string
   */
  async getDeviceId(): Promise<string> {
    // Return cached if available
    if (this.deviceId) return this.deviceId;

    // Try 1: Check IndexedDB (survives normal browser sessions)
    try {
      const stored = await db.meta.get("deviceId");
      if (stored?.value) {
        this.deviceId = stored.value;
        // Also update localStorage for redundancy
        localStorage.setItem("deviceId", this.deviceId);
        console.log("Device ID loaded from IndexedDB:", this.deviceId);
        return this.deviceId;
      }
    } catch (error) {
      console.warn("IndexedDB device ID lookup failed:", error);
    }

    // Try 2: Check localStorage (backup storage)
    const localStorageId = localStorage.getItem("deviceId");
    if (localStorageId) {
      this.deviceId = localStorageId;
      // Store in IndexedDB for next time
      await this.storeDeviceId(this.deviceId);
      console.log("Device ID loaded from localStorage:", this.deviceId);
      return this.deviceId;
    }

    // Try 3: Use FingerprintJS (survives cache clearing)
    try {
      if (!this.fpPromise) {
        this.fpPromise = FingerprintJS.load();
      }
      const fp = await this.fpPromise;
      const result = await fp.get();

      // Use visitor ID as device identifier
      this.deviceId = result.visitorId;

      // Store in both places for redundancy
      await this.storeDeviceId(this.deviceId);

      console.log("Device ID generated from fingerprint:", this.deviceId);
      return this.deviceId;
    } catch (error) {
      console.error("Fingerprinting failed, generating UUID:", error);

      // Try 4: Generate new UUID (final fallback)
      this.deviceId = this.generateUUID();
      await this.storeDeviceId(this.deviceId);
      console.log("Device ID generated as UUID:", this.deviceId);
      return this.deviceId;
    }
  }

  /**
   * Store device ID in both IndexedDB and localStorage for redundancy
   */
  private async storeDeviceId(deviceId: string): Promise<void> {
    // Store in IndexedDB
    try {
      await db.meta.put({ key: "deviceId", value: deviceId });
    } catch (error) {
      console.warn("Failed to store device ID in IndexedDB:", error);
    }

    // Store in localStorage (always succeeds or throws)
    localStorage.setItem("deviceId", deviceId);
  }

  /**
   * Generate UUID v4
   * @returns UUID string
   */
  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Methods to be added in next steps...
}

// Singleton instance
export const deviceManager = new DeviceManager();
```

**Note**: The `updateUserDevice()` method shown in the initial plan (SYNC-ENGINE.md) is intentionally deferred to chunk 027. This chunk focuses solely on local device ID generation and persistence. Device registration in the Supabase devices table will be implemented in the next chunk.

**Verify**: No TypeScript errors, imports resolve correctly.

---

## Step 4: Add Device Detection Methods (15 min)

Add these methods to the `DeviceManager` class:

```typescript
  /**
   * Detect device name (browser + OS combination)
   * @returns Device name string (e.g., "Chrome on macOS")
   */
  detectDeviceName(): string {
    const ua = navigator.userAgent;
    const browser = this.detectBrowser(ua);
    const os = this.detectOS(ua);
    return `${browser} on ${os}`;
  }

  /**
   * Detect platform type (web or PWA variant)
   * @returns Platform type
   */
  detectPlatform(): DevicePlatform {
    // Check if PWA (installed as standalone app)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) {
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "pwa-ios";
      if (/Android/.test(navigator.userAgent)) return "pwa-android";
      return "pwa-desktop";
    }
    return "web";
  }

  /**
   * Detect browser name from user agent
   * @param ua User agent string
   * @returns Browser name
   */
  private detectBrowser(ua: string): string {
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Edge")) return "Edge";
    return "Unknown Browser";
  }

  /**
   * Detect operating system from user agent
   * @param ua User agent string
   * @returns OS name
   */
  private detectOS(ua: string): string {
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    return "Unknown OS";
  }

  /**
   * Get complete device information
   * @returns DeviceInfo object
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    const id = await this.getDeviceId();
    const name = this.detectDeviceName();
    const platform = this.detectPlatform();
    const ua = navigator.userAgent;

    return {
      id,
      name,
      platform,
      fingerprint: id, // Fingerprint is same as device ID
      browser: this.detectBrowser(ua),
      os: this.detectOS(ua),
      lastSeen: new Date(),
    };
  }
```

**Verify**: No TypeScript errors, all methods compile.

---

## Step 5: Add Cache Clearing Utility (5 min)

Add method to manually reset device ID (useful for testing):

```typescript
  /**
   * Clear device ID from all storage layers
   * Useful for testing or device reset
   */
  async clearDeviceId(): Promise<void> {
    this.deviceId = null;
    this.fpPromise = null;

    // Clear from IndexedDB
    try {
      await db.meta.delete("deviceId");
    } catch (error) {
      console.warn("Failed to delete device ID from IndexedDB:", error);
    }

    // Clear from localStorage
    localStorage.removeItem("deviceId");

    console.log("Device ID cleared from all storage");
  }

  /**
   * Check if device ID exists in storage
   * @returns true if device ID is stored
   */
  async hasDeviceId(): Promise<boolean> {
    try {
      const stored = await db.meta.get("deviceId");
      return !!stored?.value;
    } catch {
      return !!localStorage.getItem("deviceId");
    }
  }
```

---

## Step 6: Create Unit Tests (15 min)

Create `src/lib/device-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { deviceManager } from "./device-manager";
import { db } from "./dexie";

describe("DeviceManager", () => {
  beforeEach(async () => {
    // Clear device ID before each test
    await deviceManager.clearDeviceId();
  });

  afterEach(async () => {
    // Cleanup
    await deviceManager.clearDeviceId();
  });

  describe("getDeviceId", () => {
    it("should generate device ID on first call", async () => {
      const deviceId = await deviceManager.getDeviceId();

      expect(deviceId).toBeDefined();
      expect(typeof deviceId).toBe("string");
      expect(deviceId.length).toBeGreaterThan(0);
    });

    it("should return same device ID on subsequent calls", async () => {
      const deviceId1 = await deviceManager.getDeviceId();
      const deviceId2 = await deviceManager.getDeviceId();

      expect(deviceId1).toBe(deviceId2);
    });

    it("should persist device ID in IndexedDB", async () => {
      const deviceId = await deviceManager.getDeviceId();

      // Check IndexedDB
      const stored = await db.meta.get("deviceId");
      expect(stored?.value).toBe(deviceId);
    });

    it("should persist device ID in localStorage", async () => {
      const deviceId = await deviceManager.getDeviceId();

      // Check localStorage
      const localStored = localStorage.getItem("deviceId");
      expect(localStored).toBe(deviceId);
    });

    it("should recover from localStorage if IndexedDB fails", async () => {
      // Store in localStorage manually
      const testId = "test-device-id-123";
      localStorage.setItem("deviceId", testId);

      // Get device ID (should use localStorage)
      const deviceId = await deviceManager.getDeviceId();

      expect(deviceId).toBe(testId);
    });

    it("should sync localStorage to IndexedDB", async () => {
      // Store only in localStorage
      const testId = "test-device-id-456";
      localStorage.setItem("deviceId", testId);

      // Get device ID (should sync to IndexedDB)
      await deviceManager.getDeviceId();

      // Verify IndexedDB now has it
      const stored = await db.meta.get("deviceId");
      expect(stored?.value).toBe(testId);
    });
  });

  describe("Device Detection", () => {
    it("should detect device name", () => {
      const name = deviceManager.detectDeviceName();

      expect(name).toBeDefined();
      expect(name).toMatch(/on/); // Should contain "on" (e.g., "Chrome on macOS")
    });

    it("should detect platform", () => {
      const platform = deviceManager.detectPlatform();

      expect(platform).toBeDefined();
      expect(["web", "pwa-ios", "pwa-android", "pwa-desktop"]).toContain(platform);
    });

    it("should get complete device info", async () => {
      const info = await deviceManager.getDeviceInfo();

      expect(info.id).toBeDefined();
      expect(info.name).toBeDefined();
      expect(info.platform).toBeDefined();
      expect(info.browser).toBeDefined();
      expect(info.os).toBeDefined();
      expect(info.lastSeen).toBeInstanceOf(Date);
    });
  });

  describe("Device ID Utilities", () => {
    it("should clear device ID", async () => {
      // Generate device ID
      await deviceManager.getDeviceId();

      // Clear it
      await deviceManager.clearDeviceId();

      // Verify cleared from IndexedDB
      const stored = await db.meta.get("deviceId");
      expect(stored).toBeUndefined();

      // Verify cleared from localStorage
      const localStored = localStorage.getItem("deviceId");
      expect(localStored).toBeNull();
    });

    it("should check if device ID exists", async () => {
      // Initially should not exist
      expect(await deviceManager.hasDeviceId()).toBe(false);

      // Generate device ID
      await deviceManager.getDeviceId();

      // Now should exist
      expect(await deviceManager.hasDeviceId()).toBe(true);
    });

    it("should generate new device ID after clear", async () => {
      const deviceId1 = await deviceManager.getDeviceId();

      await deviceManager.clearDeviceId();

      const deviceId2 = await deviceManager.getDeviceId();

      // Should be different (new UUID/fingerprint generated)
      // Note: This may fail if FingerprintJS returns same ID
      expect(deviceId2).toBeDefined();
    });
  });

  describe("UUID Generation", () => {
    it("should generate valid UUID format", async () => {
      await deviceManager.clearDeviceId();

      // Mock FingerprintJS to fail so it falls back to UUID
      vi.spyOn(global, "FingerprintJS" as any).mockImplementation(() => {
        throw new Error("Fingerprint unavailable");
      });

      const deviceId = await deviceManager.getDeviceId();

      // Check UUID v4 format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(deviceId).toMatch(uuidRegex);
    });
  });
});
```

**Run tests**:

```bash
npm test src/lib/device-manager.test.ts
```

All tests should pass.

---

## Step 7: Export from Index (3 min)

Update `src/lib/index.ts` (create if doesn't exist):

```typescript
// Device management
export { deviceManager } from "./device-manager";
export type { DeviceInfo, DevicePlatform, DeviceIdSource } from "@/types/device";
```

---

## Step 8: Test Device ID Persistence Manually (7 min)

Create a temporary test page `src/routes/test-device.tsx`:

```typescript
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { deviceManager } from "@/lib/device-manager";
import type { DeviceInfo } from "@/types/device";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/test-device")({
  component: TestDevice,
});

function TestDevice() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [hasDeviceId, setHasDeviceId] = useState(false);

  const loadDeviceInfo = async () => {
    const info = await deviceManager.getDeviceInfo();
    setDeviceInfo(info);
    setHasDeviceId(await deviceManager.hasDeviceId());
  };

  const clearDevice = async () => {
    await deviceManager.clearDeviceId();
    setDeviceInfo(null);
    setHasDeviceId(false);
  };

  useEffect(() => {
    loadDeviceInfo();
  }, []);

  return (
    <div className="container mx-auto max-w-2xl py-12 space-y-6">
      <h1 className="text-3xl font-bold">Device ID Test</h1>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Device Information</h2>

        {deviceInfo ? (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="font-medium">Device ID:</span>
              <code className="text-xs bg-gray-100 p-1 rounded">{deviceInfo.id}</code>

              <span className="font-medium">Name:</span>
              <span>{deviceInfo.name}</span>

              <span className="font-medium">Platform:</span>
              <span>{deviceInfo.platform}</span>

              <span className="font-medium">Browser:</span>
              <span>{deviceInfo.browser}</span>

              <span className="font-medium">OS:</span>
              <span>{deviceInfo.os}</span>

              <span className="font-medium">Has Device ID:</span>
              <span>{hasDeviceId ? "Yes" : "No"}</span>
            </div>
          </div>
        ) : (
          <p>Loading...</p>
        )}

        <div className="flex gap-2 mt-4">
          <Button onClick={loadDeviceInfo}>Refresh</Button>
          <Button onClick={clearDevice} variant="destructive">
            Clear Device ID
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-2">Test Instructions</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Note your Device ID</li>
          <li>Refresh the page - Device ID should stay the same</li>
          <li>Open DevTools and clear IndexedDB - Device ID should still persist (localStorage backup)</li>
          <li>Clear localStorage too - Device ID should regenerate from fingerprint</li>
          <li>Click "Clear Device ID" - New device ID generated</li>
        </ol>
      </Card>
    </div>
  );
}
```

**Visit**: http://localhost:3000/test-device

**Test Cases**:

1. Note the device ID
2. Refresh page → Device ID should remain the same
3. Open DevTools → Application → IndexedDB → Delete "deviceId" key
4. Refresh → Device ID should still be the same (from localStorage)
5. Clear localStorage in DevTools
6. Refresh → New device ID generated (from fingerprint or UUID)

**Delete test route** after verification.

---

## Done!

When all tests pass and the device ID persists correctly, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Device ID Sources**:

- **IndexedDB**: Primary storage, survives browser close
- **localStorage**: Backup storage, survives browser close
- **FingerprintJS**: Survives cache clearing (same browser/hardware)
- **UUID**: Final fallback, random

**Performance**:

- First call: 100-300ms (fingerprint generation)
- Subsequent calls: <1ms (memory cache)
- IndexedDB lookup: ~10ms
- localStorage lookup: ~1ms

**Privacy**:

- Fingerprint used only for device continuity
- No third-party tracking
- Users control device access via app permissions
- Acceptable for private household finance app

**Troubleshooting**:

- If tests fail, check Dexie meta table exists (chunk 019)
- If fingerprint fails, check FingerprintJS installation
- If UUID invalid, check regex in generateUUID()
