// Unused in this file but kept for potential future use
// import type { DevicePlatform } from "./device";

/**
 * Vector clock mapping device IDs to clock values
 * Scoped to specific entity (not global)
 */
export interface VectorClock {
  [deviceId: string]: number;
}
