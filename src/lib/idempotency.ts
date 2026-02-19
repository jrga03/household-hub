import type { EntityType } from "@/types/event";

/**
 * IdempotencyKeyGenerator creates deterministic keys for events
 *
 * Key format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 *
 * This ensures:
 * - Same mutation always generates same key (idempotent)
 * - Different devices generate different keys
 * - Events ordered by lamport clock per entity
 *
 * NOTE: Lamport clock and vector clock management has been moved to
 * LamportClockManager in vector-clock.ts for better separation of concerns.
 * This class now focuses solely on:
 * - Idempotency key generation
 * - Payload checksum calculation
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
   * Calculate checksum for payload
   *
   * @param payload Event payload (any JSON-serializable object)
   * @returns SHA-256 hex string
   */
  async calculateChecksum(payload: Record<string, unknown>): Promise<string> {
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
  private normalizePayload(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalizePayload(item));
    }

    // Sort keys and exclude timestamps
    const sorted: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;
    Object.keys(objRecord)
      .sort()
      .forEach((key) => {
        if (key !== "updated_at" && key !== "created_at") {
          sorted[key] = this.normalizePayload(objRecord[key]);
        }
      });

    return sorted;
  }
}

// Singleton instance
export const idempotencyGenerator = new IdempotencyKeyGenerator();
