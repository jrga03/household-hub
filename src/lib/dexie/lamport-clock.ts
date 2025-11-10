/**
 * Lamport Clock Utilities
 *
 * Persistent monotonic counter for idempotency key generation.
 * The lamport clock survives browser refreshes and IndexedDB clears by
 * syncing with the server's maximum clock value for the device.
 *
 * Idempotency Key Format:
 * ${deviceId}-${entityType}-${entityId}-${lamportClock}
 *
 * Usage:
 * - Call getNextLamportClock() when creating events
 * - Call initializeLamportClock() on device setup to sync with server
 * - Use getCurrentLamportClock() for debugging/diagnostics
 *
 * @module dexie/lamport-clock
 */

import { db } from "./db";

/**
 * Get next lamport clock value with atomic increment
 *
 * Atomically increments the lamport clock stored in the meta table
 * and returns the new value. This ensures unique, monotonically
 * increasing clock values for idempotency key generation.
 *
 * @returns Next clock value (1, 2, 3, ...)
 *
 * @example
 * const clock = await getNextLamportClock();
 * const idempotencyKey = `${deviceId}-transaction-${entityId}-${clock}`;
 */
export async function getNextLamportClock(): Promise<number> {
  // Fetch current clock value from meta table
  const meta = await db.meta.get("lamport_clock");
  const current = meta?.value || 0;

  // Increment atomically
  const next = (current as number) + 1;

  // Persist new value
  await db.meta.put({ key: "lamport_clock", value: next });

  return next;
}

/**
 * Initialize lamport clock from server maximum value
 *
 * Called during device setup to prevent idempotency key collisions.
 * Fetches the maximum lamport clock value from the server for this
 * device and sets the local clock to max(local, server) to ensure
 * no duplicate keys are generated.
 *
 * This handles scenarios where:
 * - Device has synced events but cleared IndexedDB
 * - Multiple devices share the same device ID (shouldn't happen)
 * - Server has higher clock due to failed sync
 *
 * @param deviceId - Current device identifier
 *
 * @example
 * // On device registration or first login
 * await initializeLamportClock(deviceId);
 */
export async function initializeLamportClock(deviceId: string): Promise<void> {
  // Dynamically import supabase to avoid circular dependencies
  const { supabase } = await import("@/lib/supabase");

  // Fetch max lamport clock from server for this device
  // Note: This RPC function needs to be created in Supabase (Phase B/C)
  // For now, we'll gracefully handle the error if it doesn't exist
  const { data, error } = await supabase.rpc("get_max_lamport_clock", {
    p_device_id: deviceId,
  });

  if (error) {
    // RPC function might not exist yet - log warning but continue
    console.warn(
      "[Lamport Clock] Failed to fetch server max (RPC may not exist yet):",
      error.message
    );
    // Initialize to 0 if no server value available
    const localMeta = await db.meta.get("lamport_clock");
    if (!localMeta) {
      await db.meta.put({ key: "lamport_clock", value: 0 });
      console.log("[Lamport Clock] Initialized to 0 (server fetch failed)");
    }
    return;
  }

  const serverMax = (data as number) || 0;

  // Get local max
  const localMeta = await db.meta.get("lamport_clock");
  const localMax = (localMeta?.value as number) || 0;

  // Set to max(local, server) to prevent collisions
  const startClock = Math.max(localMax, serverMax);

  await db.meta.put({ key: "lamport_clock", value: startClock });

  console.log("[Lamport Clock] Initialized:", {
    deviceId,
    localMax,
    serverMax,
    startClock,
  });
}

/**
 * Get current lamport clock value without incrementing
 *
 * Returns the current lamport clock value for debugging and diagnostics.
 * Does not increment the counter.
 *
 * @returns Current clock value
 *
 * @example
 * const current = await getCurrentLamportClock();
 * console.log('Current lamport clock:', current);
 */
export async function getCurrentLamportClock(): Promise<number> {
  const meta = await db.meta.get("lamport_clock");
  return (meta?.value as number) || 0;
}
