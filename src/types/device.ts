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
