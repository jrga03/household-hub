/**
 * Temporary ID → Server ID Mapping Manager
 *
 * Manages the mapping of temporary offline IDs (e.g., "temp-abc123") to
 * permanent server UUIDs during sync operations. This is critical for
 * maintaining referential integrity when syncing related entities.
 *
 * Persistence: Mappings are stored in both an in-memory Map (fast lookups)
 * and IndexedDB meta table (crash recovery). If the browser crashes mid-sync,
 * mappings can be restored from IndexedDB on the next sync session.
 *
 * @module sync/idMapping
 */

import { db } from "@/lib/dexie/db";

const ID_MAPPINGS_KEY = "sync_id_mappings";

/**
 * IDMappingManager - Tracks temp → server ID mappings with IndexedDB persistence.
 */
class IDMappingManager {
  private mappings = new Map<string, string>();
  private dirty = false;

  /**
   * Load persisted mappings from IndexedDB (call once at start of sync session)
   */
  async load(): Promise<void> {
    try {
      const entry = await db.meta.get(ID_MAPPINGS_KEY);
      if (entry && typeof entry.value === "object" && entry.value !== null) {
        const stored = entry.value as Record<string, string>;
        for (const [key, value] of Object.entries(stored)) {
          this.mappings.set(key, value);
        }
      }
    } catch (error) {
      console.error("[IDMapping] Failed to load persisted mappings:", error);
    }
  }

  /**
   * Persist current mappings to IndexedDB (only if dirty)
   */
  async persist(): Promise<void> {
    if (!this.dirty) return;
    try {
      const obj: Record<string, string> = {};
      for (const [key, value] of this.mappings) {
        obj[key] = value;
      }
      await db.meta.put({ key: ID_MAPPINGS_KEY, value: obj });
      this.dirty = false;
    } catch (error) {
      console.error("[IDMapping] Failed to persist mappings:", error);
    }
  }

  /**
   * Add mapping from temp ID to server ID.
   * Marks as dirty; call persist() at batch boundaries for crash recovery.
   */
  async add(tempId: string, serverId: string): Promise<void> {
    this.mappings.set(tempId, serverId);
    this.dirty = true;
    await this.persist();
  }

  /**
   * Get server ID for temp ID (returns original if not mapped)
   */
  get(id: string): string {
    return this.mappings.get(id) || id;
  }

  /**
   * Replace all temp IDs in an object with their server IDs
   */
  replaceIds<T extends Record<string, unknown>>(obj: T): T {
    const replaced = { ...obj };

    for (const [key, value] of Object.entries(replaced)) {
      if (typeof value === "string" && value.startsWith("temp-")) {
        (replaced as Record<string, unknown>)[key] = this.get(value);
      }
    }

    return replaced;
  }

  /**
   * Clear all mappings (call after sync session).
   * Also clears persisted mappings from IndexedDB.
   */
  async clear(): Promise<void> {
    this.mappings.clear();
    try {
      await db.meta.delete(ID_MAPPINGS_KEY);
    } catch (error) {
      console.error("[IDMapping] Failed to clear persisted mappings:", error);
    }
  }

  /**
   * Get all mappings (for debugging)
   */
  getAll(): Map<string, string> {
    return new Map(this.mappings);
  }
}

export const idMapping = new IDMappingManager();
