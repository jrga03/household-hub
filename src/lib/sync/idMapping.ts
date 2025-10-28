/**
 * Temporary ID → Server ID Mapping Manager
 *
 * Manages the mapping of temporary offline IDs (e.g., "temp-abc123") to
 * permanent server UUIDs during sync operations. This is critical for
 * maintaining referential integrity when syncing related entities.
 *
 * Use Cases:
 * 1. Transaction references temp account ID → Replace with real account UUID
 * 2. Category references temp parent ID → Replace with real parent UUID
 * 3. Budget references temp category ID → Replace with real category UUID
 *
 * The mapping is session-scoped (cleared after each sync session) to prevent
 * unbounded memory growth.
 *
 * See SYNC-ENGINE.md lines 139-151 for ID mapping strategy.
 *
 * @module sync/idMapping
 */

/**
 * IDMappingManager - Singleton class for tracking temp → server ID mappings
 *
 * Thread-safety: Safe for single-threaded JavaScript runtime.
 * Memory management: Clear mappings after each sync session to prevent leaks.
 *
 * Usage Pattern:
 * 1. After syncing entity with temp ID: idMapping.add(tempId, serverId)
 * 2. Before syncing referencing entity: payload = idMapping.replaceIds(payload)
 * 3. After sync session complete: idMapping.clear()
 *
 * @class
 */
class IDMappingManager {
  /**
   * Internal map storing temp ID → server ID mappings
   *
   * Example entries:
   * - "temp-abc123" → "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   * - "temp-xyz789" → "f1e2d3c4-b5a6-0987-fedc-ba9876543210"
   */
  private mappings = new Map<string, string>();

  /**
   * Add mapping from temp ID to server ID
   *
   * Called after successfully syncing an entity that had a temporary ID.
   * The server returns the permanent UUID, which we store for future reference.
   *
   * @param tempId - Temporary ID (e.g., "temp-abc123")
   * @param serverId - Permanent server UUID
   *
   * @example
   * // After syncing offline account
   * const result = await supabase
   *   .from("accounts")
   *   .insert({ id: "temp-account-123", name: "Checking" })
   *   .select("id")
   *   .single();
   *
   * idMapping.add("temp-account-123", result.data.id);
   * // Now "temp-account-123" maps to real UUID
   */
  add(tempId: string, serverId: string): void {
    this.mappings.set(tempId, serverId);
  }

  /**
   * Get server ID for temp ID (returns original if not mapped)
   *
   * This is safe to call on any ID - if it's not a temp ID or hasn't
   * been mapped yet, it returns the original value unchanged.
   *
   * @param id - Any ID (temp or permanent)
   * @returns Server ID if mapped, otherwise original ID
   *
   * @example
   * idMapping.add("temp-xyz", "real-uuid-456");
   *
   * idMapping.get("temp-xyz");
   * // Returns: "real-uuid-456"
   *
   * idMapping.get("already-real-uuid");
   * // Returns: "already-real-uuid" (unchanged)
   *
   * idMapping.get("temp-unmapped");
   * // Returns: "temp-unmapped" (not yet synced)
   */
  get(id: string): string {
    return this.mappings.get(id) || id;
  }

  /**
   * Replace all temp IDs in an object with their server IDs
   *
   * Walks through all string values in the object and replaces any
   * temp IDs (starting with "temp-") with their mapped server UUIDs.
   *
   * This is the primary method used before syncing entities that reference
   * other entities (e.g., transactions referencing accounts/categories).
   *
   * IMPORTANT: Only replaces IDs that start with "temp-" to avoid
   * accidentally replacing legitimate strings that happen to be in the map.
   *
   * @param obj - Object with potential temp ID references
   * @returns New object with temp IDs replaced
   *
   * @example
   * idMapping.add("temp-account-123", "real-account-uuid");
   * idMapping.add("temp-category-456", "real-category-uuid");
   *
   * const transaction = {
   *   date: "2025-10-27",
   *   description: "Grocery shopping",
   *   amount_cents: 150000,
   *   account_id: "temp-account-123",
   *   category_id: "temp-category-456",
   * };
   *
   * const replaced = idMapping.replaceIds(transaction);
   * // {
   * //   date: "2025-10-27",
   * //   description: "Grocery shopping",
   * //   amount_cents: 150000,
   * //   account_id: "real-account-uuid",
   * //   category_id: "real-category-uuid",
   * // }
   *
   * @example
   * // Non-temp IDs are unchanged
   * const transaction = {
   *   account_id: "real-uuid-already",
   *   category_id: "real-uuid-also",
   * };
   *
   * const replaced = idMapping.replaceIds(transaction);
   * // Unchanged (no temp- prefix)
   */
  replaceIds<T extends Record<string, unknown>>(obj: T): T {
    const replaced = { ...obj };

    for (const [key, value] of Object.entries(replaced)) {
      if (typeof value === "string" && value.startsWith("temp-")) {
        // Replace with mapped server ID (safe cast as we're preserving structure)
        (replaced as Record<string, unknown>)[key] = this.get(value);
      }
    }

    return replaced;
  }

  /**
   * Clear all mappings (call after sync session)
   *
   * Memory Management: Mappings are only useful during a single sync session.
   * After all queue items are processed, clear the mappings to prevent
   * memory leaks.
   *
   * Timing: Call this in the finally {} block of processQueue() to ensure
   * cleanup happens even if sync fails partway through.
   *
   * @example
   * async function processQueue() {
   *   try {
   *     for (const item of items) {
   *       await processItem(item); // Adds mappings
   *     }
   *   } finally {
   *     idMapping.clear(); // Always cleanup
   *   }
   * }
   */
  clear(): void {
    this.mappings.clear();
  }

  /**
   * Get all mappings (for debugging)
   *
   * Returns a copy of the internal mappings Map for inspection.
   * Useful for debugging sync issues or verifying that temp IDs
   * are being mapped correctly.
   *
   * @returns Copy of internal mappings
   *
   * @example
   * // After syncing multiple entities
   * const mappings = idMapping.getAll();
   * console.log("ID Mappings:", Array.from(mappings.entries()));
   * // [
   * //   ["temp-account-123", "a1b2c3d4-..."],
   * //   ["temp-category-456", "f1e2d3c4-..."],
   * // ]
   */
  getAll(): Map<string, string> {
    return new Map(this.mappings);
  }
}

/**
 * Singleton instance of IDMappingManager
 *
 * Use this exported instance throughout the sync processor.
 *
 * @example
 * import { idMapping } from '@/lib/sync/idMapping';
 *
 * // After syncing account
 * idMapping.add("temp-abc", "real-uuid");
 *
 * // Before syncing transaction
 * const payload = idMapping.replaceIds(transaction);
 *
 * // After sync session
 * idMapping.clear();
 */
export const idMapping = new IDMappingManager();
