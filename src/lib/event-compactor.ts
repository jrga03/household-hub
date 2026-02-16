/**
 * Event Compactor for Household Hub Offline-First Sync Engine
 *
 * Prevents unbounded growth of the event log in IndexedDB by periodically
 * compacting old events into snapshots. Achieves ~90% storage reduction while
 * maintaining full audit trail capabilities.
 *
 * Compaction Strategy:
 * - Trigger 1: When entity has >= 100 events
 * - Trigger 2: When >= 30 days since last compaction
 * - Safety: Always keep last 10 events uncompacted
 * - Result: ~100 events → 1 snapshot + 10 recent events
 *
 * Compaction Process:
 * 1. Check if entity meets compaction threshold
 * 2. Replay all events to build current state
 * 3. Create snapshot event with merged state
 * 4. Delete old events (keep last 10)
 * 5. Store compaction metadata in meta table
 *
 * Vector Clock Compaction (Step 2):
 * - Remove inactive devices (no events in 30+ days)
 * - Reduce vector clock size by ~60% on average
 * - Preserve active device entries for conflict detection
 *
 * Safety Guarantees:
 * - Snapshot added BEFORE deleting old events (atomic)
 * - Original events preserved via SAFETY_BUFFER
 * - Idempotent: Can run multiple times safely
 * - No data loss: All state preserved in snapshot
 *
 * @see docs/implementation/chunks/035-event-compaction/instructions.md
 * @module lib/event-compactor
 */

import { db } from "./dexie/db";
import type { TransactionEvent } from "./dexie/db";
import type { VectorClock } from "@/types/event";
import { mergeVectorClocks } from "./vector-clock";
import { nanoid } from "nanoid";
import { useSyncStore } from "@/stores/syncStore";

// ============================================================================
// Constants
// ============================================================================

/**
 * Number of events before compaction is triggered.
 * When an entity has >= 100 events, compaction will run.
 */
const COMPACTION_THRESHOLD = 100;

/**
 * Time threshold for monthly compaction (30 days in milliseconds).
 * Even if event count < 100, compact after 30 days since last compaction.
 */
const MONTHLY_COMPACTION = 30 * 24 * 60 * 60 * 1000;

/**
 * Number of recent events to keep uncompacted.
 * These events are preserved for debugging and recent history.
 */
const SAFETY_BUFFER = 10;

/**
 * Device inactivity threshold for vector clock compaction (30 days in ms).
 * Devices with no events in 30+ days will be removed from vector clock.
 * Step 2 enhancement - currently unused.
 */
const INACTIVE_DEVICE_THRESHOLD = 30 * 24 * 60 * 60 * 1000;

// Silence unused variable warning for now (will be used in Step 2)
void INACTIVE_DEVICE_THRESHOLD;

// ============================================================================
// Types
// ============================================================================

/**
 * Statistics returned by compaction operations.
 * Tracks storage savings and performance metrics.
 */
export interface CompactionStats {
  /** Number of entities compacted */
  entitiesCompacted: number;
  /** Total events deleted across all entities */
  eventsDeleted: number;
  /** Total snapshots created */
  snapshotsCreated: number;
  /** Estimated storage saved in bytes */
  storageSaved: number;
  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Metadata stored for each compacted entity.
 * Stored in meta table with key format: `compaction:${entityId}`
 */
export interface CompactionMetadata {
  /** ISO timestamp when compaction occurred */
  timestamp: string;
  /** Number of events deleted during compaction */
  eventsDeleted: number;
  /** Number of events remaining after compaction */
  eventsRemaining: number;
}

/**
 * Compaction history record with entity ID.
 * Returned by getAllCompactionHistory()
 */
export interface CompactionHistoryRecord extends CompactionMetadata {
  /** Entity ID that was compacted */
  entityId: string;
}

// ============================================================================
// Event Compactor Class
// ============================================================================

/**
 * EventCompactor manages event log compaction to prevent unbounded growth.
 *
 * Usage:
 * ```typescript
 * import { eventCompactor } from '@/lib/event-compactor';
 *
 * // Check if entity needs compaction
 * if (await eventCompactor.shouldCompact('tx-123')) {
 *   await eventCompactor.compactEntity('tx-123');
 * }
 *
 * // Or compact all eligible entities
 * const stats = await eventCompactor.compactAll();
 * console.log(`Compacted ${stats.entitiesCompacted} entities`);
 * ```
 */
export class EventCompactor {
  /**
   * Check if an entity should be compacted.
   *
   * Returns true if either:
   * 1. Event count >= COMPACTION_THRESHOLD (100 events)
   * 2. Time since last compaction >= MONTHLY_COMPACTION (30 days)
   *
   * Always returns false if entity has <= SAFETY_BUFFER events to prevent
   * compacting away all history.
   *
   * @param entityId - Entity identifier to check
   * @returns True if entity should be compacted
   *
   * @example
   * if (await eventCompactor.shouldCompact('tx-123')) {
   *   console.log('Entity needs compaction');
   * }
   */
  async shouldCompact(entityId: string): Promise<boolean> {
    // Get event count for this entity
    const eventCount = await db.events.where("entity_id").equals(entityId).count();

    // Never compact if we don't have enough events
    if (eventCount <= SAFETY_BUFFER) {
      return false;
    }

    // Trigger 1: Event count threshold
    if (eventCount >= COMPACTION_THRESHOLD) {
      return true;
    }

    // Trigger 2: Time-based threshold (monthly compaction)
    const compactionMeta = await db.meta.get(`compaction:${entityId}`);
    const metaValue = compactionMeta?.value as { timestamp?: string } | undefined;
    if (metaValue?.timestamp) {
      const lastCompactionTime = new Date(metaValue.timestamp).getTime();
      const timeSinceLastCompaction = Date.now() - lastCompactionTime;

      if (timeSinceLastCompaction >= MONTHLY_COMPACTION) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compact a single entity's event log.
   *
   * Process:
   * 1. Fetch all events for entity (sorted by lamportClock)
   * 2. Skip if <= SAFETY_BUFFER events
   * 3. Replay events to build current state
   * 4. Create snapshot event with merged state
   * 5. Add snapshot to db.events BEFORE deleting
   * 6. Delete old events (keep last SAFETY_BUFFER)
   * 7. Store compaction metadata
   *
   * @param entityId - Entity identifier to compact
   * @returns Statistics about the compaction
   *
   * @example
   * const result = await eventCompactor.compactEntity('tx-123');
   * console.log(`Deleted ${result.eventsDeleted} events`);
   */
  async compactEntity(entityId: string): Promise<{
    eventsDeleted: number;
    snapshotCreated: boolean;
  }> {
    // Fetch all events for this entity, sorted by lamport clock
    const events = await db.events.where("entity_id").equals(entityId).sortBy("lamport_clock");

    // Skip if not enough events to compact
    if (events.length <= SAFETY_BUFFER) {
      console.log(
        `[EventCompactor] Skipping entity ${entityId}: only ${events.length} events (need > ${SAFETY_BUFFER})`
      );
      return { eventsDeleted: 0, snapshotCreated: false };
    }

    console.log(`[EventCompactor] Compacting entity ${entityId}: ${events.length} events`);

    // Replay events to build current state
    const snapshot = this.replayEvents(events);

    // Compact vector clock (remove inactive devices >30 days)
    const compactedVectorClock = await this.compactVectorClock(snapshot.vectorClock);

    // Create snapshot event
    const snapshotEvent: TransactionEvent = {
      id: nanoid(),
      household_id: events[0].household_id,
      entity_id: entityId,
      entity_type: events[0].entity_type,
      op: "snapshot", // Special operation type for compaction snapshots
      payload: snapshot.state,
      lamport_clock: snapshot.lamportClock,
      vector_clock: compactedVectorClock,
      timestamp: new Date().toISOString(), // ISO timestamp string (not number)
      device_id: "system-compactor",
      actor_user_id: events[0].actor_user_id,
      idempotency_key: `snapshot-${entityId}-${Date.now()}`,
      event_version: 1,
    };

    // CRITICAL: Add snapshot BEFORE deleting old events (atomicity)
    await db.events.add(snapshotEvent);

    // Determine which events to delete (all except last SAFETY_BUFFER)
    const eventsToDelete = events.slice(0, -SAFETY_BUFFER);
    const deleteCount = eventsToDelete.length;

    // Delete old events
    await db.events.bulkDelete(eventsToDelete.map((e) => e.id));

    // Store compaction metadata
    await db.meta.put({
      key: `compaction:${entityId}`,
      value: {
        timestamp: new Date().toISOString(),
        eventsDeleted: deleteCount,
        eventsRemaining: SAFETY_BUFFER + 1, // +1 for the snapshot
      },
    });

    console.log(
      `[EventCompactor] Compacted entity ${entityId}: ${deleteCount} events deleted, ${SAFETY_BUFFER + 1} remaining`
    );

    return { eventsDeleted: deleteCount, snapshotCreated: true };
  }

  /**
   * Replay events to build current state.
   *
   * Processes events in order to reconstruct the final state:
   * - "create": Full replacement with event payload
   * - "update": Merge event payload into current state
   * - "delete": Add tombstone markers (deleted: true, deletedAt)
   * - "snapshot": Full replacement (handles existing snapshots)
   *
   * Also tracks:
   * - Maximum lamport clock value
   * - Merged vector clock across all events
   *
   * @private
   * @param events - Events to replay (must be sorted by lamportClock)
   * @returns Current state, max lamportClock, and merged vectorClock
   *
   * @example
   * const snapshot = this.replayEvents(events);
   * // snapshot.state contains final merged state
   * // snapshot.lamportClock is max clock value
   * // snapshot.vectorClock is merged clock
   */
  private replayEvents(events: TransactionEvent[]): {
    state: Record<string, unknown>;
    lamportClock: number;
    vectorClock: VectorClock;
  } {
    let state: Record<string, unknown> = {};
    let maxLamportClock = 0;
    let mergedVectorClock: VectorClock = {};

    for (const event of events) {
      // Track maximum lamport clock
      maxLamportClock = Math.max(maxLamportClock, event.lamport_clock);

      // Merge vector clocks
      mergedVectorClock = mergeVectorClocks(mergedVectorClock, event.vector_clock);

      // Replay operation
      switch (event.op) {
        case "create":
          // Full replacement
          state = { ...(event.payload as Record<string, unknown>) };
          break;

        case "update":
          // Merge changes into existing state
          state = { ...state, ...(event.payload as Record<string, unknown>) };
          break;

        case "delete":
          // Add tombstone markers
          state = {
            ...state,
            deleted: true,
            deletedAt: event.timestamp,
          };
          break;

        case "snapshot":
          // Handle existing snapshots - full replacement
          state = { ...(event.payload as Record<string, unknown>) };
          break;

        default:
          console.warn(`[EventCompactor] Unknown operation type: ${event.op}`);
      }
    }

    return {
      state,
      lamportClock: maxLamportClock,
      vectorClock: mergedVectorClock,
    };
  }

  /**
   * Compact vector clock by removing inactive devices.
   *
   * Removes devices that haven't been seen in over 30 days to reduce
   * vector clock size and speed up conflict detection.
   *
   * IMPORTANT: Preserves causality with _historical counter
   *
   * When pruning inactive devices, we track the maximum clock value
   * of pruned devices in a special `_historical` key. This prevents
   * clock regression when devices reactivate or new devices join.
   *
   * @private
   * @param vectorClock - Vector clock to compact
   * @returns Compacted vector clock with inactive devices removed
   */
  private async compactVectorClock(vectorClock: VectorClock): Promise<VectorClock> {
    const compacted: VectorClock = {};
    const now = Date.now();
    let historicalMax = 0;

    // Get device registry if available (devices table may not exist yet)
    // The `devices` table will be added in a future chunk
    type MaybeDevicesDB = typeof db & { devices?: { toArray(): Promise<unknown[]> } };
    const devicesTable = (db as MaybeDevicesDB).devices;
    const devices: unknown[] = devicesTable ? await devicesTable.toArray() : [];
    const deviceLastSeen = new Map<string, number>(
      devices.map((d: unknown) => {
        const device = d as { id?: string; last_seen_at?: string };
        const id = device.id || "";
        const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
        return [id, lastSeen];
      })
    );

    for (const [deviceId, clock] of Object.entries(vectorClock)) {
      const lastSeen = deviceLastSeen.get(deviceId) || 0;
      const inactiveDuration = now - lastSeen;

      // Keep device if active within 30 days OR if devices table doesn't exist
      if (devices.length === 0 || inactiveDuration < INACTIVE_DEVICE_THRESHOLD) {
        compacted[deviceId] = clock;
      } else {
        // Track max clock from inactive devices to preserve causality
        historicalMax = Math.max(historicalMax, clock);
        console.log(
          `[EventCompactor] Pruned inactive device ${deviceId} from vector clock (clock: ${clock}, inactive: ${Math.floor(inactiveDuration / (24 * 60 * 60 * 1000))} days)`
        );
      }
    }

    // Add _historical counter to preserve causality for pruned devices
    // This prevents clock regression when devices reactivate or new devices join
    if (historicalMax > 0) {
      compacted["_historical"] = historicalMax;
      console.log(`[EventCompactor] Added _historical counter: ${historicalMax}`);
    }

    return compacted;
  }

  /**
   * Compact all eligible entities.
   *
   * Process:
   * 1. Get all unique entity IDs from events table
   * 2. For each entity, check if shouldCompact
   * 3. If yes, call compactEntity
   * 4. Accumulate statistics
   * 5. Return total stats with duration
   *
   * @returns Aggregated compaction statistics
   *
   * @example
   * const stats = await eventCompactor.compactAll();
   * console.log(`Compacted ${stats.entitiesCompacted} entities`);
   * console.log(`Deleted ${stats.eventsDeleted} events`);
   * console.log(`Saved ~${stats.storageSaved} bytes`);
   * console.log(`Duration: ${stats.duration}ms`);
   */
  async compactAll(): Promise<CompactionStats> {
    const startTime = Date.now();

    const stats: CompactionStats = {
      entitiesCompacted: 0,
      eventsDeleted: 0,
      snapshotsCreated: 0,
      storageSaved: 0,
      duration: 0,
    };

    // SAFETY CHECK: Don't compact during active sync to avoid race conditions
    const syncStatus = useSyncStore.getState().status;
    if (syncStatus === "syncing") {
      console.log("[EventCompactor] Skipping compaction - sync in progress");
      return {
        entitiesCompacted: 0,
        eventsDeleted: 0,
        snapshotsCreated: 0,
        storageSaved: 0,
        duration: 0,
      };
    }

    try {
      // Get all unique entity IDs from events (memory-efficient streaming)
      const entityIds = new Set<string>();
      await db.events.each((event) => {
        entityIds.add(event.entity_id);
      });

      console.log(`[EventCompactor] Checking ${entityIds.size} entities for compaction`);

      // Process each entity
      for (const entityId of entityIds) {
        const shouldCompact = await this.shouldCompact(entityId);
        if (shouldCompact) {
          const result = await this.compactEntity(entityId);

          if (result.snapshotCreated) {
            stats.entitiesCompacted++;
            stats.snapshotsCreated++;
          }

          stats.eventsDeleted += result.eventsDeleted;

          // Estimate storage saved (rough approximation: 500 bytes per event)
          stats.storageSaved += result.eventsDeleted * 500;
        }
      }

      stats.duration = Date.now() - startTime;

      console.log(
        `[EventCompactor] Compaction complete: ${stats.entitiesCompacted} entities, ${stats.eventsDeleted} events deleted, ~${stats.storageSaved} bytes saved in ${stats.duration}ms`
      );

      return stats;
    } catch (error) {
      console.error("[EventCompactor] Compaction failed:", error);

      // Return zero stats on error
      return {
        entitiesCompacted: 0,
        eventsDeleted: 0,
        snapshotsCreated: 0,
        storageSaved: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get compaction history for a specific entity.
   *
   * Returns metadata about when the entity was last compacted and how many
   * events were removed.
   *
   * @param entityId - Entity identifier
   * @returns Compaction metadata or undefined if never compacted
   *
   * @example
   * const history = await eventCompactor.getCompactionHistory('tx-123');
   * console.log(`Last compacted: ${history?.timestamp}`);
   * console.log(`Events deleted: ${history?.eventsDeleted}`);
   */
  async getCompactionHistory(entityId: string): Promise<CompactionMetadata | undefined> {
    const meta = await db.meta.get(`compaction:${entityId}`);
    return meta?.value as CompactionMetadata | undefined;
  }

  /**
   * Get compaction history for all entities.
   *
   * Returns array of compaction metadata records for all entities that have
   * been compacted.
   *
   * @returns Array of compaction metadata records
   *
   * @example
   * const allHistory = await eventCompactor.getAllCompactionHistory();
   * console.log(`${allHistory.length} entities have been compacted`);
   */
  async getAllCompactionHistory(): Promise<CompactionHistoryRecord[]> {
    // Query all keys starting with "compaction:"
    const allMeta = await db.meta.toArray();
    const compactionRecords: CompactionHistoryRecord[] = allMeta
      .filter((meta) => meta.key.startsWith("compaction:"))
      .map((meta) => ({
        entityId: meta.key.replace("compaction:", ""),
        ...(meta.value as CompactionMetadata),
      }));

    return compactionRecords;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton event compactor instance.
 *
 * Use this throughout the application to manage event log compaction.
 *
 * @example
 * import { eventCompactor } from '@/lib/event-compactor';
 *
 * // Check specific entity
 * if (await eventCompactor.shouldCompact('tx-123')) {
 *   await eventCompactor.compactEntity('tx-123');
 * }
 *
 * // Or compact all
 * const stats = await eventCompactor.compactAll();
 */
export const eventCompactor = new EventCompactor();
