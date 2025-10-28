/**
 * Zustand Store for Sync Issues
 *
 * Manages UI state for sync issues panel. Issues are displayed in the
 * SyncIssuesPanel component (bottom-right expandable panel).
 *
 * Issue Types:
 * - conflict-resolved: Automatic field-level conflict resolution (LWW)
 * - sync-failed: Network or server errors during sync
 * - validation-error: Data validation failures
 *
 * Persistence:
 * - Issues are also stored in IndexedDB (db.syncIssues) for reload persistence
 * - This store provides reactive UI updates via Zustand subscriptions
 * - SyncIssuesManager handles dual persistence (IndexedDB + Zustand)
 *
 * Usage:
 * ```tsx
 * const issues = useSyncIssuesStore((state) => state.issues);
 * const addIssue = useSyncIssuesStore((state) => state.addIssue);
 * ```
 *
 * @module stores/syncIssuesStore
 */

import { create } from "zustand";

/**
 * Sync issue representing a conflict resolution or sync failure
 */
export interface SyncIssue {
  /** Unique issue ID */
  id: string;

  /** Entity type that had the issue */
  entityType: "transaction" | "account" | "category" | "budget";

  /** Entity ID that had the issue */
  entityId: string;

  /** Type of issue */
  issueType: "conflict-resolved" | "sync-failed" | "validation-error";

  /** Human-readable message describing the issue */
  message: string;

  /** Local value (for conflicts) */
  localValue?: unknown;

  /** Remote value (for conflicts) */
  remoteValue?: unknown;

  /** Resolved value (for conflicts) - what was chosen */
  resolvedValue?: unknown;

  /** When the issue occurred (ISO 8601 timestamp string) */
  timestamp: string;

  /** Whether the issue can be manually retried */
  canRetry: boolean;
}

/**
 * Sync issues store state and actions
 */
interface SyncIssuesStore {
  /** Array of all sync issues (in-memory, ephemeral) */
  issues: SyncIssue[];

  /**
   * Add a new issue to the store
   *
   * Called by SyncIssuesManager after persisting to IndexedDB.
   * Triggers UI re-render in SyncIssuesPanel.
   *
   * @param issue - Issue to add
   */
  addIssue: (issue: SyncIssue) => void;

  /**
   * Remove an issue from the store (dismiss)
   *
   * Called when user dismisses an issue.
   * SyncIssuesManager handles IndexedDB deletion.
   *
   * @param issueId - ID of issue to remove
   */
  removeIssue: (issueId: string) => void;

  /**
   * Clear all issues from store
   *
   * Called when user clicks "Clear All" button.
   * SyncIssuesManager handles IndexedDB cleanup.
   */
  clearAll: () => void;
}

/**
 * Zustand store for sync issues
 *
 * @example
 * // Subscribe to issues in component
 * function SyncIssuesPanel() {
 *   const issues = useSyncIssuesStore((state) => state.issues);
 *   return <div>{issues.length} issues</div>;
 * }
 *
 * @example
 * // Add issue from manager
 * useSyncIssuesStore.getState().addIssue({
 *   id: "issue-1",
 *   entityType: "transaction",
 *   entityId: "tx-123",
 *   issueType: "conflict-resolved",
 *   message: "Conflict in amount_cents: kept newer version",
 *   timestamp: new Date(),
 *   canRetry: false,
 * });
 */
export const useSyncIssuesStore = create<SyncIssuesStore>((set) => ({
  issues: [],

  addIssue: (issue) =>
    set((state) => ({
      issues: [...state.issues, issue],
    })),

  removeIssue: (issueId) =>
    set((state) => ({
      issues: state.issues.filter((i) => i.id !== issueId),
    })),

  clearAll: () => set({ issues: [] }),
}));
