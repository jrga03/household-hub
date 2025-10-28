import { db } from "./dexie/db";
// import { deviceManager } from "./dexie/deviceManager";
import type { EntityType, VectorClock } from "@/types/event";

/**
 * IdempotencyKeyGenerator creates deterministic keys for events
 *
 * Key format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 *
 * This ensures:
 * - Same mutation always generates same key (idempotent)
 * - Different devices generate different keys
 * - Events ordered by lamport clock per entity
 */
export class IdempotencyKeyGenerator {
  /**
   * Generate idempotency key
   *
   * @param deviceId Device ID from DeviceManager
   * @param entityType Type of entity (transaction, account, etc.)
   * @param entityId ID of specific entity
   * @param lamportClock Logical timestamp for this entity
   * @returns Deterministic idempotency key
   */
  generateKey(
    deviceId: string,
    entityType: EntityType,
    entityId: string,
    lamportClock: number
  ): string {
    // Format: device-entity_type-entity_id-clock
    return `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
  }

  /**
   * Get next lamport clock for entity
   *
   * Queries events table for highest lamport_clock for this entity,
   * then increments by 1.
   *
   * @param entityId Entity ID to query
   * @returns Next lamport clock value (1 if no events exist)
   */
  async getNextLamportClock(entityId: string): Promise<number> {
    try {
      // Query events for this entity, ordered by lamport_clock descending
      // Note: Dexie schema uses snake_case (entity_id, lamport_clock)
      const events = await db.events
        .where("entity_id")
        .equals(entityId)
        .reverse() // Descending order
        .limit(1)
        .toArray();

      if (events.length === 0) {
        // No events for this entity yet
        return 1;
      }

      // Increment highest clock
      const maxClock = events[0].lamport_clock;
      return maxClock + 1;
    } catch (error) {
      console.error("Failed to get lamport clock:", error);
      // Fallback to 1 if query fails
      return 1;
    }
  }

  /**
   * Calculate checksum for payload
   *
   * @param payload Event payload (any JSON-serializable object)
   * @returns SHA-256 hex string
   */
  async calculateChecksum(payload: any): Promise<string> {
    // Normalize payload for consistent hashing
    const normalized = this.normalizePayload(payload);
    const json = JSON.stringify(normalized);

    // Use Web Crypto API for SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return hashHex;
  }

  /**
   * Normalize payload for consistent checksum
   *
   * - Sorts object keys alphabetically
   * - Removes timestamp fields (updated_at, created_at)
   * - Recursively normalizes nested objects
   *
   * @param obj Payload to normalize
   * @returns Normalized payload
   */
  private normalizePayload(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalizePayload(item));
    }

    // Sort keys and exclude timestamps
    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        if (key !== "updated_at" && key !== "created_at") {
          sorted[key] = this.normalizePayload(obj[key]);
        }
      });

    return sorted;
  }

  /**
   * Initialize vector clock for new entity
   *
   * @param deviceId Current device ID
   * @returns Vector clock with single entry
   */
  initVectorClock(deviceId: string): VectorClock {
    return {
      [deviceId]: 1,
    };
  }

  /**
   * Update vector clock for existing entity
   *
   * @param currentClock Current vector clock
   * @param deviceId Current device ID
   * @returns Updated vector clock
   */
  updateVectorClock(currentClock: VectorClock, deviceId: string): VectorClock {
    const updated = { ...currentClock };
    updated[deviceId] = (updated[deviceId] || 0) + 1;
    return updated;
  }
}

// Singleton instance
export const idempotencyGenerator = new IdempotencyKeyGenerator();
