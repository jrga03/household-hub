/**
 * Device Identification Utilities
 *
 * Implements hybrid device ID strategy for offline-first sync:
 * 1. Check localStorage for existing device ID
 * 2. If not found, generate new UUID and store
 *
 * This is a simplified implementation for MVP. Future phases will add:
 * - IndexedDB storage (primary)
 * - FingerprintJS fallback for privacy-preserving identification
 * - Device registration in devices table
 *
 * See DECISIONS.md #75 and SYNC-ENGINE.md lines 1123-1303 for full strategy.
 *
 * @module device
 */

const DEVICE_ID_KEY = "household_hub_device_id";

/**
 * Gets the current device ID, generating and storing one if it doesn't exist.
 *
 * Uses localStorage for persistence across sessions. The device ID is a UUID
 * that uniquely identifies this browser/device for sync conflict resolution.
 *
 * @returns Promise resolving to the device ID string
 *
 * @example
 * const deviceId = await getDeviceId();
 * // "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 */
export async function getDeviceId(): Promise<string> {
  // Check localStorage for existing device ID
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate new UUID using Web Crypto API
    deviceId = crypto.randomUUID();

    // Store in localStorage for persistence
    localStorage.setItem(DEVICE_ID_KEY, deviceId);

    console.info("Generated new device ID:", deviceId);
  }

  return deviceId;
}

/**
 * Clears the stored device ID. Useful for testing or when explicitly
 * unregistering a device.
 *
 * WARNING: Clearing the device ID will cause a new ID to be generated
 * on next access, which may create sync conflicts if offline data exists.
 *
 * @example
 * clearDeviceId(); // Next getDeviceId() call will generate new ID
 */
export function clearDeviceId(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  console.info("Cleared device ID");
}

/**
 * Checks if a device ID exists without generating a new one.
 *
 * @returns true if device ID exists, false otherwise
 *
 * @example
 * if (hasDeviceId()) {
 *   console.log("This device is already registered");
 * }
 */
export function hasDeviceId(): boolean {
  return localStorage.getItem(DEVICE_ID_KEY) !== null;
}
