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

import { supabase } from "./supabase";
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

/**
 * Deactivate device (soft delete)
 *
 * Preserves device record for audit trail but marks as inactive.
 * Inactive devices should not create new events (enforced in chunk 030).
 *
 * Why soft delete instead of hard delete?
 * - Preserves event attribution history
 * - Maintains referential integrity for sync_queue.device_id
 * - Allows users to review past device activity
 * - Enables re-activation if needed
 *
 * RLS Policy: Users can only deactivate their own devices
 *
 * Error handling:
 * - Logs error to console
 * - Throws error (caller should handle)
 *
 * Future enhancement: Supabase function to auto-deactivate devices
 * inactive >90 days (prevents unbounded growth).
 *
 * @param deviceId Device ID to deactivate
 * @throws Error if Supabase update fails
 *
 * @example
 * // In device management UI (future chunk)
 * async function handleRemoveDevice(deviceId: string) {
 *   try {
 *     await deactivateDevice(deviceId);
 *     toast.success("Device removed");
 *   } catch (error) {
 *     toast.error("Failed to remove device");
 *   }
 * }
 */
export async function deactivateDevice(deviceId: string): Promise<void> {
  const { error } = await supabase
    .from("devices")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deviceId);

  if (error) {
    console.error("Failed to deactivate device:", error);
    throw error;
  }

  console.log("Device deactivated:", deviceId);
}

/**
 * Check if device is registered and active
 *
 * Used to verify device status before allowing sync operations.
 * Inactive devices should not create new events (enforced in chunk 030).
 *
 * Query optimization: Single SELECT with device ID (primary key lookup = instant)
 *
 * Error handling:
 * - Returns false on error (conservative: assume inactive if unsure)
 * - Warns to console for debugging
 * - Never throws (non-critical check)
 *
 * @param deviceId Device ID to check
 * @returns true if device exists and is active, false otherwise
 *
 * @example
 * // Before creating event (chunk 030)
 * const isActive = await isDeviceActive(deviceId);
 * if (!isActive) {
 *   throw new Error("Cannot create events from inactive device");
 * }
 */
export async function isDeviceActive(deviceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("devices")
      .select("is_active")
      .eq("id", deviceId)
      .single();

    if (error) {
      console.warn("Failed to check device status:", error);
      return false;
    }

    return data?.is_active ?? false;
  } catch (error) {
    console.warn("Error checking device status:", error);
    return false;
  }
}
