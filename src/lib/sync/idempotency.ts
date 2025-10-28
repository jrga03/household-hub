/**
 * Idempotency Key Generation for Sync Queue
 *
 * Implements deterministic idempotency key generation to prevent duplicate
 * event processing in distributed sync. Keys are unique per operation and
 * include all necessary context for debugging and conflict resolution.
 *
 * Key Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 *
 * Key Properties:
 * - Deterministic: Same inputs always produce same key
 * - Unique: Each operation gets unique key (lamportClock increments)
 * - Parseable: Can extract all components for debugging
 * - Collision-free: Device ID + entity ID + clock ensures uniqueness
 *
 * Critical Considerations:
 * - Entity IDs may contain hyphens (e.g., "temp-abc-123")
 * - Lamport clock is ALWAYS the last component (parse from end)
 * - Device IDs are UUIDs or fingerprint hashes (may contain hyphens)
 * - Entity types are enum strings (no hyphens)
 *
 * See SYNC-ENGINE.md lines 227-277 for idempotency strategy.
 * See DECISIONS.md #78 for conflict resolution rules.
 *
 * @module sync/idempotency
 */

import { deviceManager } from "@/lib/dexie/deviceManager";
import type { EntityType } from "@/types/sync";

/**
 * Parsed idempotency key components.
 */
export interface IdempotencyKeyParts {
  /** Device ID that created the operation */
  deviceId: string;
  /** Entity type (transaction, account, category, budget) */
  entityType: EntityType;
  /** Entity ID (may be temporary like "temp-abc-123") */
  entityId: string;
  /** Lamport clock value (per-entity counter) */
  lamportClock: number;
}

/**
 * Generates a deterministic idempotency key for sync operations.
 *
 * The idempotency key ensures that each operation can be uniquely identified
 * and prevents duplicate processing during sync. The key is deterministic
 * (same inputs always produce same key) and includes all context needed for
 * conflict resolution.
 *
 * Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 *
 * Component Details:
 * - deviceId: UUID or fingerprint hash from deviceManager
 * - entityType: One of "transaction", "account", "category", "budget"
 * - entityId: Entity identifier (may be temporary like "temp-abc123")
 * - lamportClock: Per-entity counter incremented on each operation
 *
 * Collision Prevention:
 * - Device ID ensures operations from different devices don't collide
 * - Entity ID scopes the key to specific entity
 * - Lamport clock ensures sequential operations on same entity are unique
 * - Combined: Guaranteed unique across all devices and operations
 *
 * Error Handling:
 * - If deviceId fetch fails, generates key with "unknown-device" placeholder
 * - Key is still usable but may cause sync issues (warn in console)
 *
 * @param entityType - Type of entity being operated on
 * @param entityId - ID of specific entity (may be temporary)
 * @param lamportClock - Current lamport clock value for this entity
 * @returns Promise resolving to idempotency key string
 *
 * @example
 * const key = await generateIdempotencyKey(
 *   "transaction",
 *   "temp-abc123",
 *   5
 * );
 * // Result: "device-xyz-transaction-temp-abc123-5"
 *
 * @example
 * // With hyphenated entity ID
 * const key = await generateIdempotencyKey(
 *   "transaction",
 *   "temp-abc-def-123",
 *   10
 * );
 * // Result: "device-xyz-transaction-temp-abc-def-123-10"
 */
export async function generateIdempotencyKey(
  entityType: EntityType,
  entityId: string,
  lamportClock: number
): Promise<string> {
  try {
    const deviceId = await deviceManager.getDeviceId();
    return `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
  } catch (error) {
    console.error("Failed to get device ID for idempotency key:", error);
    // Fallback: Use placeholder device ID (will cause sync issues but prevents crash)
    const fallbackDeviceId = "unknown-device";
    return `${fallbackDeviceId}-${entityType}-${entityId}-${lamportClock}`;
  }
}

/**
 * Parses an idempotency key back into its components.
 *
 * This function handles the complexity of entity IDs that may contain hyphens
 * (e.g., "temp-abc-123"). Since lamport clock is always the last component
 * and is numeric, we parse from the end of the string.
 *
 * Parsing Strategy:
 * 1. Split key by hyphens
 * 2. Extract lamportClock from end (must be numeric)
 * 3. Extract entityType (second-to-last component)
 * 4. Extract deviceId (first component, may be UUID with hyphens)
 * 5. Remaining middle components form entityId (may have hyphens)
 *
 * Edge Cases:
 * - Entity ID with hyphens: "temp-abc-123" → parsed correctly
 * - Device ID with hyphens: UUID format → first segment only
 * - Invalid lamport clock: Non-numeric → returns null
 * - Too few components: Less than 4 parts → returns null
 *
 * Error Handling:
 * - Invalid format: Returns null (caller should handle gracefully)
 * - All errors logged but don't throw
 *
 * @param key - Idempotency key to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * const parts = parseIdempotencyKey("device-xyz-transaction-temp-abc123-5");
 * // {
 * //   deviceId: "device-xyz",
 * //   entityType: "transaction",
 * //   entityId: "temp-abc123",
 * //   lamportClock: 5
 * // }
 *
 * @example
 * // With hyphenated entity ID
 * const parts = parseIdempotencyKey("device-xyz-transaction-temp-abc-def-123-10");
 * // {
 * //   deviceId: "device-xyz",
 * //   entityType: "transaction",
 * //   entityId: "temp-abc-def-123",
 * //   lamportClock: 10
 * // }
 *
 * @example
 * // Invalid format
 * const parts = parseIdempotencyKey("invalid-key");
 * // null
 */
export function parseIdempotencyKey(key: string): IdempotencyKeyParts | null {
  try {
    // Split by hyphens
    const parts = key.split("-");

    // Need at least 4 parts: deviceId, entityType, entityId, lamportClock
    if (parts.length < 4) {
      console.warn("Invalid idempotency key format (too few parts):", key);
      return null;
    }

    // Parse from end (lamport clock is always last)
    const lamportClockStr = parts[parts.length - 1];
    const lamportClock = parseInt(lamportClockStr, 10);

    // Validate lamport clock is numeric
    if (isNaN(lamportClock)) {
      console.warn("Invalid lamport clock in idempotency key:", key);
      return null;
    }

    // Device ID is first component (may be part of UUID)
    const deviceId = parts[0];

    // Entity type is at fixed position 1 (always second component)
    const entityType = parts[1] as EntityType;

    // Validate entity type
    const validEntityTypes: EntityType[] = ["transaction", "account", "category", "budget"];
    if (!validEntityTypes.includes(entityType)) {
      console.warn("Invalid entity type in idempotency key:", key, "type:", entityType);
      return null;
    }

    // Entity ID is everything between entityType and lamportClock
    // This handles entity IDs with hyphens like "temp-abc-123"
    // Format: deviceId-entityType-[entityId parts]-lamportClock
    const entityIdParts = parts.slice(2, parts.length - 1);
    const entityId = entityIdParts.join("-");

    // Validate entityId exists
    if (!entityId) {
      console.warn("Empty entity ID in idempotency key:", key);
      return null;
    }

    return {
      deviceId,
      entityType,
      entityId,
      lamportClock,
    };
  } catch (error) {
    console.error("Failed to parse idempotency key:", key, error);
    return null;
  }
}
