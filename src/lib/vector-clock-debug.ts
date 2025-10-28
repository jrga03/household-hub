import type { VectorClock } from "@/types/sync";
import { compareVectorClocks, getMaxClockValue } from "./vector-clock";

/**
 * Format vector clock for human-readable display
 *
 * Converts a vector clock object to a compact string representation.
 * Sorts devices alphabetically and truncates device IDs to first 8 chars.
 *
 * @param clock - Vector clock to format
 * @returns Formatted string like "{device-a:5, device-x:3}"
 *
 * @example
 * formatVectorClock({ "device-abc123": 5, "device-xyz789": 3 })
 * // Returns: "{device-a:5, device-x:3}"
 */
export function formatVectorClock(clock: VectorClock): string {
  const entries = Object.entries(clock)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([device, value]) => `${device.substring(0, 8)}:${value}`)
    .join(", ");

  return `{${entries}}`;
}

/**
 * Log vector clock comparison for debugging
 *
 * Logs both clocks and the comparison result to console.
 * Useful for debugging sync issues and conflict detection.
 *
 * @param label - Descriptive label for this comparison
 * @param local - Local vector clock
 * @param remote - Remote vector clock
 *
 * @example
 * logVectorClockComparison("Sync Check", localClock, remoteClock);
 * // Console output:
 * // [Vector Clock] Sync Check
 * //   Local:  {device-a:5, device-b:2}
 * //   Remote: {device-a:3, device-b:4}
 * //   Result: concurrent
 */
export function logVectorClockComparison(
  label: string,
  local: VectorClock,
  remote: VectorClock
): void {
  const comparison = compareVectorClocks(local, remote);

  console.log(`[Vector Clock] ${label}`);
  console.log(`  Local:  ${formatVectorClock(local)}`);
  console.log(`  Remote: ${formatVectorClock(remote)}`);
  console.log(`  Result: ${comparison}`);
}

/**
 * Get vector clock summary statistics
 *
 * Returns useful metrics about a vector clock for debugging and monitoring.
 *
 * @param clock - Vector clock to analyze
 * @returns Object with deviceCount, maxValue, and totalEvents
 *
 * @example
 * const stats = getVectorClockStats({ device1: 5, device2: 3, device3: 8 });
 * // Returns: { deviceCount: 3, maxValue: 8, totalEvents: 16 }
 */
export function getVectorClockStats(clock: VectorClock): {
  deviceCount: number;
  maxValue: number;
  totalEvents: number;
} {
  const values = Object.values(clock);

  return {
    deviceCount: Object.keys(clock).length,
    maxValue: getMaxClockValue(clock),
    totalEvents: values.reduce((sum, val) => sum + val, 0),
  };
}
