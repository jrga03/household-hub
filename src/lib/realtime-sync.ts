/**
 * Realtime Sync Manager for Household Hub
 *
 * Manages Supabase realtime subscriptions for all entity types (transactions,
 * accounts, categories, budgets). Handles INSERT, UPDATE, DELETE events from
 * PostgreSQL CDC and syncs them to IndexedDB with conflict resolution.
 *
 * Key Features:
 * 1. **Device Filtering**: Filters out own-device changes using `device_id=neq.${deviceId}`
 *    to prevent infinite loops when this device's changes propagate back
 * 2. **Conflict Detection**: Uses vector clock comparison to detect concurrent edits
 * 3. **Automatic Resolution**: Integrates with conflict resolution engine for Phase B LWW
 * 4. **Multi-Table Subscriptions**: Subscribes to all entity tables with health tracking
 * 5. **Reconnection Handling**: Catches up on missed changes when connection restored
 *
 * Realtime Event Flow:
 * 1. Device A creates transaction → Supabase INSERT
 * 2. PostgreSQL CDC emits realtime event
 * 3. Device B receives event (filtered: device_id != Device B's ID)
 * 4. Device B checks for conflicts with vector clocks
 * 5. If conflict: Resolve using Phase B strategy (DELETE-wins, record-level LWW)
 * 6. If no conflict: Apply change directly to IndexedDB
 *
 * Device Filtering (CRITICAL):
 * Without filtering, this flow creates infinite loops:
 * 1. Device A creates transaction → writes to Supabase
 * 2. Supabase broadcasts to all subscriptions (including Device A!)
 * 3. Device A receives its own change → writes to IndexedDB again
 * 4. IndexedDB triggers sync queue → writes to Supabase again
 * 5. Loop continues forever (CPU 100%, network spam, data corruption)
 *
 * Solution: Filter subscriptions with `device_id=neq.${deviceId}` so devices
 * NEVER receive their own changes back from the server.
 *
 * Connection Health:
 * - SUBSCRIBED: Active, receiving events
 * - CHANNEL_ERROR: Subscription failed (retry required)
 * - TIMED_OUT: Supabase connection timeout (retry required)
 * - CLOSED: Graceful cleanup (expected on unmount)
 *
 * Reconnection Strategy:
 * - Process sync queue first (upload pending local changes)
 * - Fetch changes since last sync timestamp
 * - Merge with timestamp comparison (remote > local = apply remote)
 * - Update syncStore with lastSyncTime on success
 *
 * Performance:
 * - Each change event ~1KB over WebSocket
 * - 100 changes/min = ~100KB/min = ~6MB/hour
 * - Supabase free tier: 200 concurrent connections (sufficient for household)
 *
 * iOS Safari Considerations:
 * - Background tabs may pause WebSocket connections
 * - Use visibilitychange event to trigger reconnection on focus
 * - See handleReconnection() method for catch-up logic
 *
 * @see docs/implementation/chunks/034-sync-realtime/instructions.md
 * @see docs/initial plan/SYNC-ENGINE.md (lines 1543-1699 for realtime sync)
 * @module lib/realtime-sync
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { db, type LocalTransaction, type LocalAccount, type LocalCategory } from "@/lib/dexie/db";
import { getDeviceId } from "@/lib/dexie/deviceManager";
import { syncProcessor } from "@/lib/sync/processor";
import { useSyncStore } from "@/stores/syncStore";
import { useAuthStore } from "@/stores/authStore";
import { reportError } from "@/lib/sentry";

/**
 * Table names that support realtime sync
 * Note: budgets table will be added in a future chunk when budgets offline support is implemented
 */
type SyncTableName = "transactions" | "accounts" | "categories";

/**
 * Realtime payload from Supabase (generic for any table)
 */
type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

/**
 * Union type for all synced table records
 */
type SyncRecord = LocalTransaction | LocalAccount | LocalCategory;

/**
 * Generic table interface for type-erased Dexie operations.
 * Used to work around union type incompatibilities when getTable()
 * returns a union of Table<T> types (where .add()/.put() expect `never`).
 */
interface AnyTable {
  get(key: string): Promise<SyncRecord | undefined>;
  add(item: unknown): Promise<string>;
  put(item: unknown): Promise<string>;
  delete(key: string): Promise<void>;
}

/**
 * Type-safe table accessor to handle Dexie's union type properly
 *
 * @param tableName - Name of the table to access
 * @returns The Dexie table instance
 */
function getTable(tableName: SyncTableName): AnyTable {
  switch (tableName) {
    case "transactions":
      return db.transactions as unknown as AnyTable;
    case "accounts":
      return db.accounts as unknown as AnyTable;
    case "categories":
      return db.categories as unknown as AnyTable;
  }
}

/**
 * Realtime Sync Manager
 *
 * Manages Supabase realtime subscriptions with device filtering, conflict
 * resolution, and reconnection handling.
 *
 * Usage:
 * ```typescript
 * // Initialize in App.tsx
 * useEffect(() => {
 *   realtimeSync.initialize();
 *   return () => realtimeSync.cleanup();
 * }, []);
 * ```
 *
 * @example
 * // Manual reconnection on network restore
 * window.addEventListener("online", () => {
 *   realtimeSync.handleReconnection();
 * });
 *
 * @example
 * // Check subscription health
 * const isHealthy = realtimeSync.isHealthy();
 * if (!isHealthy) {
 *   console.warn("Realtime sync unhealthy - reinitializing");
 *   await realtimeSync.cleanup();
 *   await realtimeSync.initialize();
 * }
 */
export class RealtimeSync {
  /** Map of table names to Supabase channels */
  private subscriptions: Map<SyncTableName, RealtimeChannel> = new Map();

  /** Flag to prevent duplicate initialization */
  private isInitialized = false;

  /** Current device ID (cached to avoid repeated localStorage reads) */
  private deviceId: string | null = null;

  /**
   * Initialize realtime subscriptions for all entity tables
   *
   * Subscribes to transactions, accounts, categories, and budgets with
   * device filtering to prevent infinite loops. Updates syncStore status
   * based on subscription health.
   *
   * Device Filtering:
   * Each subscription uses `filter: device_id=neq.${deviceId}` to exclude
   * changes made by this device. This prevents the infinite loop:
   * local change → Supabase → realtime event back to this device → local change → ...
   *
   * Error Handling:
   * - CHANNEL_ERROR: Logs error, sets status to "error", does NOT throw
   * - TIMED_OUT: Logs timeout, sets status to "error", does NOT throw
   * - SUBSCRIBED: Sets status to "online" on success
   *
   * @throws {Error} If device ID cannot be retrieved (localStorage unavailable)
   *
   * @example
   * await realtimeSync.initialize();
   * // Subscriptions active for all tables
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn("[RealtimeSync] Already initialized - skipping");
      return;
    }

    // Get device ID once and cache it
    try {
      this.deviceId = await getDeviceId();
    } catch (error) {
      console.error("[RealtimeSync] Failed to get device ID:", error);
      useSyncStore.getState().setStatus("error");
      throw new Error("Cannot initialize realtime sync without device ID");
    }

    console.log(`[RealtimeSync] Initializing with device ID: ${this.deviceId}`);

    // Subscribe to all entity tables (budgets will be added in future chunk)
    const tables: SyncTableName[] = ["transactions", "accounts", "categories"];

    try {
      await Promise.all(tables.map((table) => this.subscribeToTable(table)));
      this.isInitialized = true;
      console.log("[RealtimeSync] Initialization complete - all subscriptions active");
    } catch (error) {
      console.error("[RealtimeSync] Initialization failed:", error);
      useSyncStore.getState().setStatus("error");
      throw error;
    }
  }

  /**
   * Subscribe to a single table with device filtering
   *
   * Creates a Supabase realtime channel for the specified table with:
   * - Device filtering: `device_id=neq.${deviceId}` (CRITICAL!)
   * - Event handlers: INSERT, UPDATE, DELETE
   * - Health tracking: SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT
   *
   * Subscription Lifecycle:
   * 1. Create channel with unique name: `${tableName}-changes`
   * 2. Add postgres_changes listener for all events (*)
   * 3. Subscribe with status callback for health tracking
   * 4. Store channel in subscriptions map for cleanup
   *
   * @param tableName - Name of table to subscribe to
   *
   * @example
   * await subscribeToTable("transactions");
   * // Now receiving realtime events for transactions (except own-device)
   */
  private async subscribeToTable(tableName: SyncTableName): Promise<void> {
    if (!this.deviceId) {
      throw new Error("Device ID not initialized");
    }

    console.log(`[RealtimeSync] Subscribing to ${tableName} (device: ${this.deviceId})`);

    // Own-device changes are skipped CLIENT-SIDE in handleTableChange, not
    // via a server `device_id=neq.X` filter: in Postgres, `neq` is NULL for
    // NULL device_id rows, so a server filter silently dropped every change
    // written without a device ID (review SYNC-15).
    const channel = supabase
      .channel(`${tableName}-changes`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: tableName,
        },
        (payload) => this.handleTableChange(tableName, payload)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[RealtimeSync] ✓ Subscribed to ${tableName}`);
          useSyncStore.getState().setStatus("online");
        } else if (status === "CHANNEL_ERROR") {
          console.error(`[RealtimeSync] ✗ Subscription error for ${tableName}`);
          useSyncStore.getState().setStatus("error");
        } else if (status === "TIMED_OUT") {
          console.error(`[RealtimeSync] ⏱ Subscription timeout for ${tableName}`);
          useSyncStore.getState().setStatus("error");
        } else if (status === "CLOSED") {
          console.log(`[RealtimeSync] Subscription closed for ${tableName} (cleanup)`);
        }
      });

    // Store channel for cleanup
    this.subscriptions.set(tableName, channel);
  }

  /**
   * Handle realtime change event from any table
   *
   * Routes INSERT, UPDATE, DELETE events to appropriate handlers.
   * Updates syncStore status to "syncing" during processing.
   *
   * Error Handling:
   * - Logs errors to console (no throw - prevents subscription crash)
   * - Sets syncStore status to "error" on failure
   * - Individual record errors don't stop batch processing
   *
   * @param tableName - Table that changed
   * @param payload - Realtime event payload from Supabase
   */
  private async handleTableChange(
    tableName: SyncTableName,
    payload: RealtimePayload
  ): Promise<void> {
    // CRITICAL: Skip own-device changes to prevent the echo loop (this
    // device writes → server broadcasts → this device re-applies). Done
    // client-side so rows with NULL device_id still reach other devices.
    const changedDeviceId =
      (payload.new as Record<string, unknown> | null)?.device_id ??
      (payload.old as Record<string, unknown> | null)?.device_id;
    if (this.deviceId && changedDeviceId === this.deviceId) {
      return;
    }

    console.log(`[RealtimeSync] Change on ${tableName}:`, payload.eventType);

    // Update status to syncing
    useSyncStore.getState().setStatus("syncing");

    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      switch (eventType) {
        case "INSERT":
          await this.handleInsert(tableName, newRecord);
          break;
        case "UPDATE":
          await this.handleUpdate(tableName, newRecord, oldRecord);
          break;
        case "DELETE":
          await this.handleDelete(tableName, oldRecord);
          break;
        default:
          console.warn(`[RealtimeSync] Unknown event type: ${eventType}`);
      }

      // Update status to online and record sync time
      useSyncStore.getState().setStatus("online");
      useSyncStore.getState().setLastSyncTime(new Date());
    } catch (error) {
      console.error(`[RealtimeSync] Error handling ${payload.eventType} on ${tableName}:`, error);
      useSyncStore.getState().setStatus("error");

      reportError(error, {
        subsystem: "realtime-sync",
        operation: `${payload.eventType}:${tableName}`,
      });
    }
  }

  /**
   * Handle INSERT event from Supabase
   *
   * Adds the new record to IndexedDB if it doesn't already exist.
   * Duplicate detection: Checks db.get() before inserting.
   *
   * @param tableName - Table that received INSERT
   * @param record - New record from Supabase
   */
  private async handleInsert(
    tableName: SyncTableName,
    record: Record<string, unknown>
  ): Promise<void> {
    // Type-safe table access using Dexie schema
    const table = getTable(tableName);

    // Check if record already exists (prevent duplicate inserts)
    const existing = await table.get(record.id as string);
    if (existing) {
      console.log(`[RealtimeSync] Record ${record.id} already exists in ${tableName} (skipping)`);
      return;
    }

    // Add to IndexedDB
    await table.add(record);
    console.log(`[RealtimeSync] ✓ Inserted ${record.id} into ${tableName}`);
  }

  /**
   * Handle UPDATE event from Supabase with timestamp Last-Write-Wins
   *
   * Phase A conflict strategy (Decision #62): the newer updated_at wins,
   * matching mergeRecord() in the reconnection catch-up path. The Phase B
   * vector-clock detection/resolution stack was removed as unreachable
   * (clocks never left the device, so it always concluded "no conflict";
   * review SYNC-05) and will be reintroduced end-to-end in Phase B.
   *
   * Keeping the newer local record protects unsynced local edits: the
   * outbox will push them, and the resulting server UPDATE echoes back to
   * other devices.
   *
   * @param tableName - Table that received UPDATE
   * @param newRecord - Updated record from Supabase
   * @param oldRecord - Previous record state (may be partial)
   */
  private async handleUpdate(
    tableName: SyncTableName,
    newRecord: Record<string, unknown>,
    _oldRecord: Record<string, unknown>
  ): Promise<void> {
    const table = getTable(tableName);

    const localRecord = await table.get(newRecord.id as string);

    if (localRecord) {
      const localFields = localRecord as unknown as Record<string, unknown>;
      const localTime = new Date((localFields.updated_at as string) || 0).getTime();
      const remoteTime = new Date(newRecord.updated_at as string).getTime();

      if (localTime >= remoteTime) {
        console.log(
          `[RealtimeSync] Kept local ${newRecord.id} in ${tableName} (local newer or same)`
        );
        return;
      }
    }

    await table.put(newRecord);
    console.log(`[RealtimeSync] ✓ Updated ${newRecord.id} in ${tableName}`);
  }

  /**
   * Handle DELETE event from Supabase
   *
   * Removes the record from IndexedDB. Uses delete() instead of put()
   * to ensure complete removal (no tombstone needed in IndexedDB).
   *
   * @param tableName - Table that received DELETE
   * @param record - Deleted record (may be partial, but must have id)
   */
  private async handleDelete(
    tableName: SyncTableName,
    record: Record<string, unknown>
  ): Promise<void> {
    const table = getTable(tableName);

    // Delete from IndexedDB
    await table.delete(record.id as string);
    console.log(`[RealtimeSync] ✓ Deleted ${record.id} from ${tableName}`);
  }

  /**
   * Handle reconnection after network restore
   *
   * Catch-up strategy when connection is restored:
   * 1. Process sync queue first (upload pending local changes)
   * 2. Fetch changes since last sync using updated_at timestamp
   * 3. Merge records with timestamp comparison (remote > local = apply)
   * 4. Update syncStore with lastSyncTime on success
   *
   * Error Handling:
   * - Logs errors to console
   * - Sets syncStore status to "error" on failure
   * - Does NOT throw (allows partial recovery)
   *
   * Performance:
   * - Fetches ALL changes since last sync (no pagination for MVP)
   * - For large gaps (days offline), may fetch 100+ records per table
   * - Uses bulk put() operations for efficient IndexedDB writes
   *
   * @example
   * // Trigger on network restore
   * window.addEventListener("online", () => {
   *   realtimeSync.handleReconnection();
   * });
   */
  async handleReconnection(): Promise<void> {
    console.log("[RealtimeSync] Connection restored - catching up on missed changes");

    useSyncStore.getState().setStatus("syncing");

    try {
      // Step 1: Push queued local changes first so the catch-up fetch
      // cannot clobber unsynced local edits. Delegates to the real sync
      // processor (this used to be a console.log stub, review SYNC-02).
      const userId = useAuthStore.getState().user?.id;
      if (userId) {
        await syncProcessor.processQueue(userId);
      }

      // Step 2: Fetch latest changes from server to catch up
      await this.fetchLatestChanges();

      // Success - update status
      useSyncStore.getState().setStatus("online");
      const now = new Date();
      useSyncStore.getState().setLastSyncTime(now);
      await db.meta.put({ key: "lastSyncTime", value: now.toISOString() });
      console.log("[RealtimeSync] ✓ Reconnection catch-up complete");
    } catch (error) {
      console.error("[RealtimeSync] Reconnection catch-up failed:", error);
      useSyncStore.getState().setStatus("error");

      reportError(error, { subsystem: "realtime-sync", operation: "reconnection" });
    }
  }

  /**
   * Fetch latest changes from server since the persisted high-water mark
   *
   * Queries Supabase for all records updated since the last observed
   * server-side updated_at (persisted in db.meta, so it survives reloads -
   * previously this cursor lived in the in-memory store and every page
   * load silently fell back to "last 24 hours", losing anything older;
   * review SYNC-11).
   *
   * Merges records into IndexedDB using timestamp comparison:
   * - No local record: Add remote record
   * - Remote updated_at > local updated_at: Update with remote
   * - Local updated_at >= remote updated_at: Keep local (local is newer)
   *
   * The cursor advances to the max updated_at actually seen (server
   * timestamps, immune to client clock skew) and only after a fully
   * successful pass, so a failed table fetch is retried from the same
   * cursor next time. First run falls back to the last 24 hours.
   *
   * @private
   */
  private async fetchLatestChanges(): Promise<void> {
    const HIGH_WATER_MARK_KEY = "syncHighWaterMark";

    const stored = await db.meta.get(HIGH_WATER_MARK_KEY);
    const since = stored?.value
      ? new Date(stored.value as string)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // first run: last 24 hours

    console.log(`[RealtimeSync] Fetching changes since ${since.toISOString()}`);

    const tables: SyncTableName[] = ["transactions", "accounts", "categories"];
    let maxSeen = "";
    let allSucceeded = true;

    for (const tableName of tables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select("*")
          .gte("updated_at", since.toISOString())
          .order("updated_at", { ascending: true });

        if (error) {
          console.error(`[RealtimeSync] Failed to fetch ${tableName}:`, error);
          allSucceeded = false;
          continue;
        }

        if (data && data.length > 0) {
          console.log(`[RealtimeSync] Fetched ${data.length} changes from ${tableName}`);

          // Merge changes into IndexedDB
          for (const record of data) {
            await this.mergeRecord(tableName, record);
            const updatedAt = record.updated_at as string;
            if (updatedAt > maxSeen) {
              maxSeen = updatedAt;
            }
          }
        }
      } catch (error) {
        console.error(`[RealtimeSync] Error fetching ${tableName}:`, error);
        allSucceeded = false;
        // Continue with other tables
      }
    }

    // Advance the cursor only after a clean pass; gte + idempotent merge
    // makes re-processing the boundary row harmless
    if (allSucceeded && maxSeen) {
      await db.meta.put({ key: HIGH_WATER_MARK_KEY, value: maxSeen });
    }
  }

  /**
   * Merge remote record into IndexedDB with timestamp comparison
   *
   * Merge strategy:
   * - No local record: Add remote (new data)
   * - Remote updated_at > local updated_at: Update with remote (remote is newer)
   * - Local updated_at >= remote updated_at: Keep local (local is newer or same)
   *
   * @param tableName - Table to merge into
   * @param record - Remote record from Supabase
   * @private
   */
  private async mergeRecord(
    tableName: SyncTableName,
    record: Record<string, unknown>
  ): Promise<void> {
    const table = getTable(tableName);

    const local = await table.get(record.id as string);

    if (!local) {
      // New record - add it
      await table.add(record);
      console.log(`[RealtimeSync] Added new record ${record.id} to ${tableName}`);
    } else {
      // Compare timestamps to determine which version is newer
      const remoteTime = new Date(record.updated_at as string).getTime();
      const localFields = local as unknown as Record<string, unknown>;
      const localTime = new Date(localFields.updated_at as string).getTime();

      if (remoteTime > localTime) {
        // Remote is newer - update local
        await table.put(record);
        console.log(`[RealtimeSync] Updated ${record.id} in ${tableName} (remote newer)`);
      } else {
        // Local is newer or same - keep local
        console.log(`[RealtimeSync] Kept local ${record.id} in ${tableName} (local newer or same)`);
      }
    }
  }

  /**
   * Check if realtime sync is healthy
   *
   * Returns true if all subscriptions are active and status is not "error".
   * Used by health monitoring to detect subscription failures.
   *
   * @returns True if sync is healthy, false otherwise
   *
   * @example
   * // Periodic health check
   * setInterval(() => {
   *   if (!realtimeSync.isHealthy()) {
   *     console.warn("Unhealthy - reinitializing");
   *     realtimeSync.cleanup();
   *     realtimeSync.initialize();
   *   }
   * }, 60000); // Every minute
   */
  isHealthy(): boolean {
    const status = useSyncStore.getState().status;
    const expectedTables = 3; // transactions, accounts, categories (budgets in future chunk)

    return status !== "error" && this.subscriptions.size === expectedTables && this.isInitialized;
  }

  /**
   * Cleanup all subscriptions (call on unmount)
   *
   * Unsubscribes from all Supabase channels and clears internal state.
   * MUST be called when component unmounts to prevent memory leaks.
   *
   * Error Handling:
   * - Logs errors but continues with cleanup
   * - Clears subscriptions map even if some fail
   * - Resets isInitialized flag
   *
   * @example
   * // In React component
   * useEffect(() => {
   *   realtimeSync.initialize();
   *   return () => realtimeSync.cleanup();
   * }, []);
   */
  async cleanup(): Promise<void> {
    console.log("[RealtimeSync] Cleaning up subscriptions...");

    for (const [tableName, channel] of this.subscriptions) {
      try {
        await supabase.removeChannel(channel);
        console.log(`[RealtimeSync] ✓ Unsubscribed from ${tableName}`);
      } catch (error) {
        console.error(`[RealtimeSync] Error unsubscribing from ${tableName}:`, error);
      }
    }

    this.subscriptions.clear();
    this.isInitialized = false;
    this.deviceId = null;

    console.log("[RealtimeSync] Cleanup complete");
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton realtime sync instance
 *
 * Use this instance throughout the application for consistency.
 * Initialize once in App.tsx and cleanup on unmount.
 *
 * @example
 * import { realtimeSync } from '@/lib/realtime-sync';
 *
 * // In App.tsx
 * useEffect(() => {
 *   realtimeSync.initialize();
 *   return () => realtimeSync.cleanup();
 * }, []);
 *
 * @example
 * // Reconnection handler
 * window.addEventListener("online", () => {
 *   realtimeSync.handleReconnection();
 * });
 */
export const realtimeSync = new RealtimeSync();
