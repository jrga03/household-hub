/**
 * Device Registration Utilities
 *
 * Thin wrapper around DeviceManager for app-level device registration.
 *
 * NOTE: Actual device registration logic is in DeviceManager.updateUserDevice()
 * (src/lib/dexie/deviceManager.ts lines 284-362). This file provides app-level
 * utilities that trigger device registration and manage device lifecycle.
 *
 * Features:
 * - Triggers device registration via DeviceManager.getDeviceId()
 * - Throttled last_seen updates (delegated to DeviceManager)
 * - Device deactivation (soft delete for audit trail)
 * - Device status checking
 *
 * Usage:
 * ```typescript
 * // On app mount - triggers DeviceManager which registers device
 * await ensureDeviceRegistered(user.id);
 *
 * // Device registration happens automatically in DeviceManager.getDeviceId()
 * ```
 *
 * Architecture Note:
 * Device registration happens in DeviceManager.updateUserDevice() to avoid
 * duplication and ensure single source of truth. This wrapper simply ensures
 * DeviceManager is initialized when the user logs in.
 *
 * See SYNC-ENGINE.md lines 1209-1245 for device registration design.
 * See DECISIONS.md #82 for devices table promotion to MVP rationale.
 *
 * @module lib/device-registration
 */

import { deviceManager } from "./dexie/deviceManager";

/**
 * Ensure device is registered for the current user
 *
 * This function triggers DeviceManager.getDeviceId() which automatically
 * registers the device in Supabase via DeviceManager.updateUserDevice().
 *
 * Architecture Note:
 * Device registration happens automatically in DeviceManager when getDeviceId()
 * is called for the first time. This function simply ensures DeviceManager
 * is initialized when the user logs in.
 *
 * DeviceManager handles:
 * - Device ID generation (hybrid strategy: IndexedDB → localStorage → FingerprintJS → UUID)
 * - Device registration in Supabase devices table
 * - Device metadata detection (name, platform, fingerprint)
 * - Duplicate registration prevention (race condition handling)
 * - last_seen updates (throttled to 5 minutes in DeviceManager)
 *
 * Error handling:
 * - Never throws (DeviceManager handles errors gracefully)
 * - App continues to work even if device registration fails
 * - Errors logged to console for debugging
 *
 * @param userId Current user ID (not used but kept for API compatibility)
 * @returns Device ID
 *
 * @example
 * // On app mount
 * useEffect(() => {
 *   if (!user) return;
 *
 *   async function register() {
 *     try {
 *       await ensureDeviceRegistered(user.id);
 *       console.log("Device registered successfully");
 *     } catch (error) {
 *       // This won't throw, but handle anyway for safety
 *       console.error("Device registration failed:", error);
 *     }
 *   }
 *
 *   register();
 * }, [user]);
 */
export async function ensureDeviceRegistered(_userId: string): Promise<string> {
  // Simply call getDeviceId() - registration happens automatically
  // in DeviceManager.updateUserDevice() (deviceManager.ts lines 284-362)
  // userId parameter kept for API compatibility but not used
  // (DeviceManager gets user from Supabase auth context)
  return deviceManager.getDeviceId();
}

/**
 * Trigger last_seen update via DeviceManager
 *
 * DeviceManager already handles last_seen updates with 5-minute throttling
 * in updateUserDevice(). This function simply triggers DeviceManager to
 * check and update last_seen if needed.
 *
 * NOTE: DeviceManager throttles updates automatically (lines 339-356 in deviceManager.ts).
 * No additional throttling needed here.
 *
 * @example
 * // On window focus
 * useEffect(() => {
 *   function handleFocus() {
 *     if (user) {
 *       triggerDeviceLastSeenUpdate();
 *     }
 *   }
 *
 *   window.addEventListener("focus", handleFocus);
 *   return () => window.removeEventListener("focus", handleFocus);
 * }, [user]);
 */
export function triggerDeviceLastSeenUpdate(): void {
  // DeviceManager will handle last_seen update with built-in throttling
  // We just need to trigger it by calling getDeviceId() which runs updateUserDevice()
  deviceManager.getDeviceId().catch((error) => {
    console.warn("Failed to trigger last_seen update:", error);
    // Non-critical error, app continues
  });
}
