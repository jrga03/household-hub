/**
 * Sync Issues Manager - Logging and Management for Sync Issues
 *
 * Responsible for logging sync-related issues (conflicts, failures, validation errors)
 * and persisting them to IndexedDB + Zustand store for UI display.
 *
 * Issue Types:
 * 1. conflict-resolved: Automatic LWW conflict resolution (shows what was chosen)
 * 2. sync-failed: Network/server errors during sync (retryable)
 * 3. validation-error: Data validation failures (may be retryable after fix)
 *
 * Dual Persistence:
 * - IndexedDB (db.syncIssues): Survives page reloads
 * - Zustand (useSyncIssuesStore): Reactive UI updates
 *
 * Integration Points:
 * - Called by sync processor after conflict resolution (chunk 032)
 * - Called by sync processor on sync failures
 * - Called by validation layer on data errors
 *
 * Usage:
 * ```typescript
 * // Log conflict resolution
 * await syncIssuesManager.logConflictResolution(
 *   "transaction",
 *   "tx-123",
 *   "amount_cents",
 *   10000,  // local value
 *   15000,  // remote value
 *   15000   // resolved (chose remote)
 * );
 *
 * // Log sync failure
 * await syncIssuesManager.logSyncFailure(
 *   "transaction",
 *   "tx-456",
 *   new Error("Network timeout"),
 *   true  // can retry
 * );
 * ```
 *
 * @module sync/SyncIssuesManager
 */

import { db } from "@/lib/dexie/db";
import { useSyncIssuesStore, type SyncIssue } from "@/stores/syncIssuesStore";

/**
 * SyncIssuesManager - Singleton class for managing sync issues
 *
 * Provides methods for logging different types of sync issues and
 * managing issue lifecycle (retry, dismiss, clear).
 *
 * @class
 */
class SyncIssuesManager {
  /**
   * In-memory cache of issues (Map for O(1) lookups by ID)
   * Mirrors IndexedDB but provides fast access for operations
   */
  private issues: Map<string, SyncIssue> = new Map();

  /**
   * Log automatic conflict resolution
   *
   * Called by sync processor when LWW conflict resolution occurs.
   * Shows users what conflicted and what value was chosen.
   *
   * Example Scenarios:
   * - Two devices edit transaction description simultaneously
   * - Two devices change transaction amount at same time
   * - Offline edit conflicts with server changes
   *
   * @param entityType - Type of entity that had conflict
   * @param entityId - ID of conflicted entity
   * @param field - Field name that conflicted
   * @param localValue - Value on this device
   * @param remoteValue - Value from server
   * @param resolvedValue - Value that was chosen (LWW logic)
   *
   * @example
   * // Transaction description conflict
   * await logConflictResolution(
   *   "transaction",
   *   "tx-123",
   *   "description",
   *   "Old description",     // local
   *   "New description",     // remote
   *   "New description"      // resolved (remote newer)
   * );
   */
  async logConflictResolution(
    entityType: string,
    entityId: string,
    field: string,
    localValue: unknown,
    remoteValue: unknown,
    resolvedValue: unknown
  ): Promise<void> {
    const issueId = `${entityId}-${field}-${Date.now()}`;

    // Format message based on resolved value type
    const resolvedDisplay =
      typeof resolvedValue === "object" ? "newer version" : `"${resolvedValue}"`;

    const issue: SyncIssue = {
      id: issueId,
      entityType: entityType as SyncIssue["entityType"],
      entityId,
      issueType: "conflict-resolved",
      message: `Conflict in ${field}: kept ${resolvedDisplay}`,
      localValue,
      remoteValue,
      resolvedValue,
      timestamp: new Date().toISOString(), // Store as ISO string
      canRetry: false, // Conflicts are auto-resolved, no retry needed
    };

    // Store in memory cache
    this.issues.set(issueId, issue);

    // Persist to IndexedDB (no conversion needed - already ISO string)
    try {
      await db.syncIssues.add(issue);
    } catch (error) {
      console.warn("Failed to store conflict in IndexedDB:", error);
    }

    // Update UI state
    useSyncIssuesStore.getState().addIssue(issue);
  }

  /**
   * Log sync failures (network, server errors)
   *
   * Called by sync processor when sync operation fails.
   * Users can manually retry if canRetry is true.
   *
   * Example Scenarios:
   * - Network timeout while syncing
   * - Server temporarily unavailable (503)
   * - RLS policy rejection (403)
   * - Rate limiting (429)
   *
   * @param entityType - Type of entity that failed to sync
   * @param entityId - ID of entity that failed
   * @param error - Error object from sync failure
   * @param canRetry - Whether user can manually retry this operation
   *
   * @example
   * // Network timeout
   * await logSyncFailure(
   *   "transaction",
   *   "tx-789",
   *   new Error("Network timeout after 30s"),
   *   true  // User can retry
   * );
   *
   * @example
   * // RLS rejection (non-retryable)
   * await logSyncFailure(
   *   "transaction",
   *   "tx-101",
   *   new Error("RLS policy violation"),
   *   false  // Cannot retry (permission issue)
   * );
   */
  async logSyncFailure(
    entityType: string,
    entityId: string,
    error: Error,
    canRetry: boolean
  ): Promise<void> {
    const issueId = `${entityId}-sync-${Date.now()}`;

    const issue: SyncIssue = {
      id: issueId,
      entityType: entityType as SyncIssue["entityType"],
      entityId,
      issueType: "sync-failed",
      message: error.message || "Sync failed",
      timestamp: new Date().toISOString(), // Store as ISO string
      canRetry,
    };

    // Store in memory cache
    this.issues.set(issueId, issue);

    // Persist to IndexedDB (no conversion needed)
    try {
      await db.syncIssues.add(issue);
    } catch (error) {
      console.warn("Failed to store sync failure in IndexedDB:", error);
    }

    // Update UI state
    useSyncIssuesStore.getState().addIssue(issue);
  }

  /**
   * Log validation errors
   *
   * Called when data fails validation checks before or during sync.
   *
   * Example Scenarios:
   * - Amount must be positive (got negative value)
   * - Date in future (not allowed)
   * - Required field missing
   * - Field exceeds max length
   *
   * @param entityType - Type of entity with validation error
   * @param entityId - ID of entity
   * @param error - Validation error object
   *
   * @example
   * // Negative amount validation
   * await logValidationError(
   *   "transaction",
   *   "tx-bad",
   *   new Error("Amount must be positive")
   * );
   */
  async logValidationError(entityType: string, entityId: string, error: Error): Promise<void> {
    const issueId = `${entityId}-validation-${Date.now()}`;

    const issue: SyncIssue = {
      id: issueId,
      entityType: entityType as SyncIssue["entityType"],
      entityId,
      issueType: "validation-error",
      message: `Validation error: ${error.message}`,
      timestamp: new Date().toISOString(), // Store as ISO string
      canRetry: true, // May retry after fixing the data
    };

    // Store in memory cache
    this.issues.set(issueId, issue);

    // Persist to IndexedDB (no conversion needed)
    try {
      await db.syncIssues.add(issue);
    } catch (error) {
      console.warn("Failed to store validation error in IndexedDB:", error);
    }

    // Update UI state
    useSyncIssuesStore.getState().addIssue(issue);
  }

  /**
   * Retry failed sync operation
   *
   * Called when user clicks retry button in UI.
   * Currently a stub - actual retry logic delegated to sync processor.
   *
   * TODO (Chunk 032): Integrate with sync processor to retry specific item
   * await syncQueue.processItem(issue.entityId);
   *
   * @param issueId - ID of issue to retry
   * @returns Promise resolving to true if retry succeeded, false otherwise
   *
   * @example
   * // User clicks retry button
   * const success = await syncIssuesManager.retrySync("issue-123");
   * if (success) {
   *   toast.success("Sync retried successfully");
   * }
   */
  async retrySync(issueId: string): Promise<boolean> {
    const issue = this.issues.get(issueId);
    if (!issue || !issue.canRetry) return false;

    try {
      // TODO (Chunk 032): Call sync processor to retry this specific item
      // await syncQueue.processItem(issue.entityId);

      // For now, just remove the issue (simulate success)
      // Real implementation will come with chunk 032 integration
      console.warn("Retry not implemented yet - removing issue as placeholder");

      // CRITICAL: Remove from ALL THREE stores to prevent memory leak
      this.issues.delete(issueId); // Memory cache
      await db.syncIssues.delete(issueId); // IndexedDB
      useSyncIssuesStore.getState().removeIssue(issueId); // Zustand

      return true;
    } catch (error) {
      // Update issue with new error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      issue.message = `Retry failed: ${errorMessage}`;
      issue.timestamp = new Date().toISOString(); // ISO string

      // Update in all stores
      this.issues.set(issueId, issue); // Update memory cache
      await db.syncIssues.put(issue); // Update IndexedDB (no conversion needed)

      return false;
    }
  }

  /**
   * Dismiss issue (user acknowledges)
   *
   * Removes issue from UI and IndexedDB.
   * Called when user clicks dismiss button.
   *
   * @param issueId - ID of issue to dismiss
   *
   * @example
   * // User clicks X button
   * await syncIssuesManager.dismissIssue("issue-456");
   */
  async dismissIssue(issueId: string): Promise<void> {
    this.issues.delete(issueId);

    try {
      await db.syncIssues.delete(issueId);
    } catch (error) {
      console.warn("Failed to delete issue from IndexedDB:", error);
    }

    useSyncIssuesStore.getState().removeIssue(issueId);
  }

  /**
   * Get all pending issues
   *
   * Returns issues from in-memory cache.
   * Used for debugging and testing.
   *
   * @returns Array of all pending issues
   *
   * @example
   * const issues = await syncIssuesManager.getPendingIssues();
   * console.log(`${issues.length} pending issues`);
   */
  async getPendingIssues(): Promise<SyncIssue[]> {
    return Array.from(this.issues.values());
  }

  /**
   * Clear all issues
   *
   * Removes all issues from memory, IndexedDB, and UI.
   * Called when user clicks "Clear All" button.
   *
   * @example
   * // User clicks "Clear All"
   * await syncIssuesManager.clearAll();
   */
  async clearAll(): Promise<void> {
    this.issues.clear();

    try {
      await db.syncIssues.clear();
    } catch (error) {
      console.warn("Failed to clear issues from IndexedDB:", error);
    }

    useSyncIssuesStore.getState().clearAll();
  }

  /**
   * Load issues from IndexedDB on app startup
   *
   * Restores persisted issues to memory cache and Zustand store.
   * Should be called once during app initialization.
   *
   * @example
   * // In App.tsx or __root.tsx useEffect
   * useEffect(() => {
   *   syncIssuesManager.loadFromStorage();
   * }, []);
   */
  async loadFromStorage(): Promise<void> {
    try {
      const stored = await db.syncIssues.toArray();
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let loadedCount = 0;

      for (const record of stored) {
        // Auto-dismiss issues older than 7 days
        const issueDate = new Date(record.timestamp).getTime();
        if (issueDate < sevenDaysAgo) {
          await db.syncIssues.delete(record.id);
          continue;
        }

        // Timestamp is already ISO string - no conversion needed
        // Cast types from string to the union types
        const issue: SyncIssue = {
          ...record,
          entityType: record.entityType as SyncIssue["entityType"],
          issueType: record.issueType as SyncIssue["issueType"],
        };

        this.issues.set(issue.id, issue);
        useSyncIssuesStore.getState().addIssue(issue);
        loadedCount++;
      }

      console.log(
        `Loaded ${loadedCount} sync issues from IndexedDB (auto-dismissed ${stored.length - loadedCount} old issues)`
      );
    } catch (error) {
      console.warn("Failed to load sync issues from IndexedDB:", error);
    }
  }
}

/**
 * Singleton instance of SyncIssuesManager
 *
 * Use this exported instance throughout the application.
 *
 * @example
 * import { syncIssuesManager } from '@/lib/sync/SyncIssuesManager';
 *
 * await syncIssuesManager.logConflictResolution(...);
 */
export const syncIssuesManager = new SyncIssuesManager();
