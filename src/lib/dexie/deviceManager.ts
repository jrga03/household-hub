/**
 * Device Manager with Hybrid Device ID Strategy
 *
 * Implements the 3-tier hybrid device identification approach for offline-first sync:
 * 1. IndexedDB (fastest, most reliable)
 * 2. localStorage (backup if IndexedDB fails)
 * 3. FingerprintJS (survives cache clearing)
 * 4. crypto.randomUUID() (final fallback)
 *
 * Features:
 * - Memory caching for performance
 * - Dual storage (IndexedDB + localStorage) for redundancy
 * - Automatic Supabase device registration (Decision #82)
 * - Device platform/browser detection for UX
 * - Graceful error handling (warnings, not crashes)
 *
 * See SYNC-ENGINE.md lines 1123-1303 for full strategy details.
 * See DECISIONS.md #52, #75, #82 for design rationale.
 *
 * @module dexie/deviceManager
 */

import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { db } from "./db";
import { supabase } from "@/lib/supabase";

/**
 * Default household ID for MVP (single household mode).
 * See DECISIONS.md #59 for multi-household architecture (Phase 2+).
 */
const DEFAULT_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";

/**
 * localStorage key for device ID backup storage.
 */
const DEVICE_ID_KEY = "household_hub_device_id";

/**
 * DeviceManager - Singleton class for hybrid device identification.
 *
 * Responsibilities:
 * - Provide stable device ID across sessions
 * - Register device in Supabase devices table
 * - Detect device platform/browser for UX
 * - Handle device history merging for vector clocks (Phase B)
 *
 * Usage:
 * ```typescript
 * import { deviceManager } from '@/lib/dexie/deviceManager';
 *
 * const deviceId = await deviceManager.getDeviceId();
 * // "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 * ```
 *
 * @class
 */
class DeviceManager {
  /**
   * Memory cache for device ID (performance optimization).
   * Prevents repeated lookups within same session.
   */
  private deviceId: string | null = null;

  /**
   * Cached FingerprintJS promise (singleton pattern).
   * Loading fingerprint library is expensive, cache the promise.
   */
  private fpPromise: Promise<any> | null = null;

  /**
   * Gets the current device ID using 3-tier hybrid fallback strategy.
   *
   * Priority order:
   * 1. Memory cache (instant)
   * 2. IndexedDB meta table (fastest persistent storage)
   * 3. localStorage (backup if IndexedDB fails)
   * 4. FingerprintJS (survives cache clearing)
   * 5. crypto.randomUUID() (final fallback)
   *
   * The device ID is stored in BOTH IndexedDB and localStorage for redundancy.
   * This ensures device ID persists even if one storage mechanism fails.
   *
   * Side effects:
   * - Calls updateUserDevice() on first generation to register in Supabase
   * - Stores device ID in both IndexedDB and localStorage
   * - Caches result in memory for subsequent calls
   *
   * Error handling:
   * - All errors are warned to console but don't throw
   * - Graceful degradation through fallback chain
   * - App continues to work even if all storage mechanisms fail
   *
   * @returns Promise resolving to the device ID (UUID format)
   *
   * @example
   * const deviceId = await deviceManager.getDeviceId();
   * console.log(deviceId); // "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   */
  async getDeviceId(): Promise<string> {
    // Return cached if available (instant)
    if (this.deviceId) {
      return this.deviceId;
    }

    // Try 1: Check IndexedDB (fastest persistent storage)
    try {
      const stored = await db.meta.get("deviceId");
      if (stored?.value && typeof stored.value === "string") {
        this.deviceId = stored.value;

        // Update localStorage for redundancy
        localStorage.setItem(DEVICE_ID_KEY, this.deviceId);

        console.info("Device ID loaded from IndexedDB:", this.deviceId);
        return this.deviceId;
      }
    } catch (error) {
      console.warn("IndexedDB device ID lookup failed:", error);
      // Continue to next fallback
    }

    // Try 2: Check localStorage (backup storage)
    try {
      const localStorageId = localStorage.getItem(DEVICE_ID_KEY);
      if (localStorageId && typeof localStorageId === "string") {
        this.deviceId = localStorageId;

        // Store in IndexedDB for next time
        await this.storeDeviceId(this.deviceId);

        console.info("Device ID restored from localStorage:", this.deviceId);
        return this.deviceId;
      }
    } catch (error) {
      console.warn("localStorage device ID lookup failed:", error);
      // Continue to next fallback
    }

    // Try 3: Use FingerprintJS (survives cache clearing)
    try {
      if (!this.fpPromise) {
        this.fpPromise = FingerprintJS.load();
      }

      const fp = await this.fpPromise;
      const result = await fp.get();

      // Use visitor ID as device identifier
      const visitorId = result.visitorId;
      if (typeof visitorId === "string") {
        this.deviceId = visitorId;

        // Store in both places for redundancy
        await this.storeDeviceId(this.deviceId);

        console.info("Device ID generated from fingerprint:", this.deviceId);
        return this.deviceId;
      }
    } catch (error) {
      console.warn("FingerprintJS failed, using crypto.randomUUID fallback:", error);
      // Continue to final fallback
    }

    // Final fallback: Generate new UUID
    this.deviceId = crypto.randomUUID();
    await this.storeDeviceId(this.deviceId);

    console.info("Device ID generated as new UUID:", this.deviceId);
    return this.deviceId;
  }

  /**
   * Stores device ID in both IndexedDB and localStorage for redundancy.
   *
   * This method is private and called internally by getDeviceId() when a new
   * device ID is generated or restored from fallback storage.
   *
   * Side effects:
   * - Writes to IndexedDB meta table
   * - Writes to localStorage
   * - Calls updateUserDevice() to register in Supabase
   *
   * Error handling:
   * - IndexedDB errors are warned but don't block localStorage write
   * - localStorage errors are warned but don't block device registration
   * - All errors are non-fatal (graceful degradation)
   *
   * @param deviceId - The device ID to store
   * @returns Promise that resolves when storage completes
   * @private
   */
  private async storeDeviceId(deviceId: string): Promise<void> {
    // Store in IndexedDB (primary storage)
    try {
      await db.meta.put({ key: "deviceId", value: deviceId });
    } catch (error) {
      console.warn("Failed to store device ID in IndexedDB:", error);
      // Continue anyway - localStorage is backup
    }

    // Store in localStorage (backup storage)
    try {
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    } catch (error) {
      console.warn("Failed to store device ID in localStorage:", error);
      // Continue anyway - device ID is still in memory
    }

    // Register device in Supabase devices table (Decision #82)
    await this.updateUserDevice();
  }

  /**
   * Clears the stored device ID from all storage locations.
   *
   * This is useful for:
   * - Testing device registration flow
   * - Explicitly unregistering a device
   * - Debugging sync issues
   *
   * WARNING: Clearing the device ID will cause a new ID to be generated
   * on next getDeviceId() call. This may create sync conflicts if offline
   * data exists with the old device ID.
   *
   * Side effects:
   * - Clears memory cache
   * - Deletes from IndexedDB meta table
   * - Removes from localStorage
   * - Does NOT delete from Supabase devices table (preserves history)
   *
   * @example
   * deviceManager.clearDeviceId();
   * const newId = await deviceManager.getDeviceId();
   * // Will generate a new device ID
   */
  async clearDeviceId(): Promise<void> {
    // Clear memory cache
    this.deviceId = null;

    // Delete from IndexedDB (async operation)
    try {
      await db.meta.delete("deviceId");
    } catch (error) {
      console.warn("Failed to delete device ID from IndexedDB:", error);
    }

    // Remove from localStorage (sync operation)
    try {
      localStorage.removeItem(DEVICE_ID_KEY);
    } catch (error) {
      console.warn("Failed to remove device ID from localStorage:", error);
    }

    console.info("Device ID cleared from local storage");
  }

  /**
   * Registers or updates device in Supabase devices table.
   *
   * This method is called automatically by storeDeviceId() when a new device
   * ID is generated or restored. It ensures the devices table stays in sync
   * with the client's device ID.
   *
   * Behavior:
   * - If device doesn't exist: INSERT with detected name/platform/fingerprint
   * - If device exists: UPDATE last_seen timestamp
   *
   * Device detection:
   * - name: "Chrome on macOS" (browser + OS)
   * - platform: "web" | "pwa-ios" | "pwa-android" | "pwa-desktop"
   * - fingerprint: Stores device ID for continuity
   *
   * Error handling:
   * - Gracefully handles offline (no network connection)
   * - Gracefully handles unauthenticated state (no user logged in)
   * - All errors are warned but don't block app functionality
   * - Device registration happens in background, doesn't block sync
   *
   * See DECISIONS.md #82 for devices table promotion to MVP rationale.
   *
   * @returns Promise that resolves when registration completes
   * @private
   */
  private async updateUserDevice(): Promise<void> {
    try {
      // Get current authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        // User not authenticated yet - this is expected during initial load
        // Device will be registered after login
        return;
      }

      // Check if device already registered
      const { data: existing, error: fetchError } = await supabase
        .from("devices")
        .select("id, last_seen")
        .eq("id", this.deviceId)
        .maybeSingle();

      if (fetchError) {
        console.warn("Failed to check existing device:", fetchError);
        return;
      }

      if (!existing) {
        // Register new device
        const { error: insertError } = await supabase.from("devices").insert({
          id: this.deviceId,
          user_id: user.id,
          household_id: DEFAULT_HOUSEHOLD_ID,
          name: this.detectDeviceName(),
          platform: this.detectPlatform(),
          fingerprint: this.deviceId, // Store for continuity
          is_active: true,
        });

        if (insertError) {
          // Handle duplicate key errors gracefully (race condition from multiple tabs)
          // PostgreSQL error code 23505 = unique_violation
          if (insertError.code === "23505") {
            console.debug(
              "Device already registered by another tab (race condition resolved):",
              this.deviceId
            );
            return; // Success - device is registered by another process
          }

          console.warn("Failed to register device:", insertError);
          return;
        }

        console.info("Device registered in Supabase:", this.deviceId);
      } else {
        // Update last_seen timestamp (only if more than 5 minutes old)
        const lastSeen = new Date(existing.last_seen);
        const now = new Date();
        const minutesSinceLastUpdate = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

        if (minutesSinceLastUpdate > 5) {
          const { error: updateError } = await supabase
            .from("devices")
            .update({ last_seen: now.toISOString() })
            .eq("id", this.deviceId);

          if (updateError) {
            console.warn("Failed to update device last_seen:", updateError);
            return;
          }

          console.debug("Device last_seen updated:", this.deviceId);
        }
      }
    } catch (error) {
      console.warn("Failed to update user device:", error);
      // Graceful degradation - app continues to work offline
    }
  }

  /**
   * Detects device name for UX (e.g., "Chrome on macOS").
   *
   * Combines browser name and OS from user agent string.
   * Used for display in device management UI.
   *
   * @returns Device name string (e.g., "Chrome on macOS")
   * @private
   */
  private detectDeviceName(): string {
    const ua = navigator.userAgent;
    const browser = this.detectBrowser(ua);
    const os = this.detectOS(ua);
    return `${browser} on ${os}`;
  }

  /**
   * Detects platform for PWA vs web detection.
   *
   * Platform types:
   * - "pwa-ios": Installed PWA on iOS
   * - "pwa-android": Installed PWA on Android
   * - "pwa-desktop": Installed PWA on desktop
   * - "web": Regular web browser
   *
   * Uses display-mode: standalone media query to detect PWA installation.
   *
   * @returns Platform identifier
   * @private
   */
  private detectPlatform(): string {
    // Check if PWA is installed and running in standalone mode
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

    if (isStandalone) {
      // Detect iOS
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        return "pwa-ios";
      }

      // Detect Android
      if (/Android/.test(navigator.userAgent)) {
        return "pwa-android";
      }

      // Desktop PWA
      return "pwa-desktop";
    }

    // Regular web browser
    return "web";
  }

  /**
   * Detects browser name from user agent string.
   *
   * Handles common browsers:
   * - Firefox
   * - Safari (excluding Chrome on macOS)
   * - Chrome (including Chromium-based browsers)
   * - Edge
   *
   * Uses simple string matching (no heavy regex for MVP).
   *
   * @param ua - User agent string
   * @returns Browser name
   * @private
   */
  private detectBrowser(ua: string): string {
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Edg")) return "Edge"; // Edge uses "Edg" in UA
    if (ua.includes("Chrome")) return "Chrome";
    return "Unknown Browser";
  }

  /**
   * Detects OS from user agent string.
   *
   * Handles common operating systems:
   * - macOS
   * - Windows
   * - Linux
   * - Android
   * - iOS (iPhone, iPad, iPod)
   *
   * Uses simple string matching (no heavy regex for MVP).
   *
   * @param ua - User agent string
   * @returns OS name
   * @private
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
   * Merges device history for vector clock continuity (Phase B).
   *
   * This method is used when a device ID changes (e.g., after cache clear)
   * but we want to maintain vector clock continuity for conflict resolution.
   *
   * Behavior:
   * - Updates all transaction_events with oldDeviceId to use newDeviceId
   * - Preserves vector clock values for conflict resolution
   * - This is critical for maintaining causal ordering in distributed sync
   *
   * Use cases:
   * - User explicitly merges two device identities
   * - Device ID recovery after cache clear with manual intervention
   * - Testing conflict resolution scenarios
   *
   * Note: This is NOT called automatically. It's a manual operation for
   * Phase B vector clock conflict resolution.
   *
   * See SYNC-ENGINE.md lines 1282-1293 for context.
   *
   * @param oldDeviceId - The old device ID to replace
   * @param newDeviceId - The new device ID to use
   * @returns Promise that resolves when merge completes
   *
   * @example
   * await deviceManager.mergeDeviceHistory(
   *   "old-device-123",
   *   "new-device-456"
   * );
   */
  async mergeDeviceHistory(oldDeviceId: string, newDeviceId: string): Promise<void> {
    console.info(`Merging device history from ${oldDeviceId} to ${newDeviceId}`);

    try {
      // Update all events with old device ID to new one
      // This maintains vector clock continuity for conflict resolution
      const { error } = await supabase
        .from("transaction_events")
        .update({ device_id: newDeviceId })
        .eq("device_id", oldDeviceId);

      if (error) {
        console.error("Failed to merge device history:", error);
        throw error;
      }

      console.info("Device history merged successfully");
    } catch (error) {
      console.error("Error merging device history:", error);
      throw error;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of DeviceManager.
 *
 * Use this exported instance throughout the app for device identification.
 *
 * @example
 * import { deviceManager } from '@/lib/dexie/deviceManager';
 *
 * const deviceId = await deviceManager.getDeviceId();
 */
export const deviceManager = new DeviceManager();

// ============================================================================
// Backward Compatibility Exports (for existing device.ts usage)
// ============================================================================

/**
 * Gets the current device ID (backward compatible wrapper).
 *
 * This provides backward compatibility with the existing device.ts API
 * used in chunk 018 (transfers-ui) and earlier code.
 *
 * @returns Promise resolving to the device ID
 * @example
 * const deviceId = await getDeviceId();
 */
export async function getDeviceId(): Promise<string> {
  return deviceManager.getDeviceId();
}

/**
 * Clears the stored device ID (backward compatible wrapper).
 *
 * @returns Promise that resolves when all storage is cleared
 * @example
 * await clearDeviceId();
 */
export async function clearDeviceId(): Promise<void> {
  return deviceManager.clearDeviceId();
}

/**
 * Checks if a device ID exists without generating a new one.
 *
 * This is a lightweight check that only looks at localStorage for
 * backward compatibility with existing code.
 *
 * @returns true if device ID exists in any storage, false otherwise
 * @example
 * if (hasDeviceId()) {
 *   console.log("This device is already registered");
 * }
 */
export function hasDeviceId(): boolean {
  // Check localStorage first (fastest)
  const localStorageId = localStorage.getItem(DEVICE_ID_KEY);
  if (localStorageId) return true;

  // Note: We don't check IndexedDB here because it's async and this needs
  // to be synchronous for backward compatibility. The actual getDeviceId()
  // call will check IndexedDB properly.
  return false;
}
