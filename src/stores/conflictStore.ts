/**
 * Zustand Store for Conflicts
 *
 * Manages UI state for conflict notifications. Conflicts are detected when
 * two devices edit the same entity concurrently (vector clocks are "concurrent").
 *
 * Conflict Lifecycle:
 * 1. Detected by conflict-detector.ts during sync
 * 2. Persisted to IndexedDB conflicts table
 * 3. Added to this store for UI notification
 * 4. Automatically resolved by sync processor (chunk 033)
 * 5. Removed from store after resolution
 *
 * Persistence:
 * - Conflicts are stored in IndexedDB (db.conflicts) for reload persistence
 * - This store provides reactive UI updates via Zustand subscriptions
 * - ConflictDetector handles dual persistence (IndexedDB + Zustand)
 *
 * Resolution Strategies (Phase B):
 * - last-write-wins: Default for most fields (amount_cents, description, etc.)
 * - cleared-wins: Transaction status where 'cleared' beats 'pending'
 * - concatenate: Merge both versions with separator (notes field)
 * - delete-wins: DELETE operations beat UPDATE operations
 * - false-wins: Deactivation wins for is_active fields
 *
 * Usage:
 * ```tsx
 * const conflicts = useConflictStore((state) => state.conflicts);
 * const pendingCount = useConflictStore((state) => state.getPendingCount());
 * ```
 *
 * @see docs/initial plan/SYNC-ENGINE.md (lines 365-511 for resolution rules)
 * @see docs/initial plan/DECISIONS.md (Decision #78 for field-level merge)
 * @module stores/conflictStore
 */

import { create } from "zustand";
import type { Conflict } from "@/types/sync";

/**
 * Conflict store state and actions
 */
interface ConflictStore {
  /** Array of all conflicts (in-memory, ephemeral) */
  conflicts: Conflict[];

  /**
   * Add a new conflict to the store
   *
   * Called by ConflictDetector after persisting to IndexedDB.
   * Triggers UI re-render in ConflictIndicator component.
   *
   * @param conflict - Conflict to add
   */
  addConflict: (conflict: Conflict) => void;

  /**
   * Remove a conflict from the store (after resolution)
   *
   * Called after conflict is resolved by sync processor.
   * ConflictDetector handles IndexedDB update.
   *
   * @param conflictId - ID of conflict to remove
   */
  removeConflict: (conflictId: string) => void;

  /**
   * Clear all conflicts from store
   *
   * Called when user clears conflict history.
   * ConflictDetector handles IndexedDB cleanup.
   */
  clearConflicts: () => void;

  /**
   * Get count of pending conflicts
   *
   * Used by ConflictIndicator to show badge count.
   *
   * @returns Number of conflicts with resolution="pending"
   */
  getPendingCount: () => number;
}

/**
 * Zustand store for conflicts
 *
 * @example
 * // Subscribe to conflicts in component
 * function ConflictIndicator() {
 *   const pendingCount = useConflictStore((state) => state.getPendingCount());
 *   if (pendingCount === 0) return null;
 *   return <Badge>{pendingCount} conflicts</Badge>;
 * }
 *
 * @example
 * // Add conflict from detector
 * import { useConflictStore } from '@/stores/conflictStore';
 *
 * useConflictStore.getState().addConflict({
 *   id: "conflict-1",
 *   entityType: "transaction",
 *   entityId: "tx-123",
 *   detectedAt: new Date(),
 *   localEvent: localEvent,
 *   remoteEvent: remoteEvent,
 *   resolution: "pending",
 * });
 *
 * @example
 * // Remove after resolution
 * useConflictStore.getState().removeConflict("conflict-1");
 */
export const useConflictStore = create<ConflictStore>((set, get) => ({
  conflicts: [],

  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [...state.conflicts, conflict],
    })),

  removeConflict: (conflictId) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== conflictId),
    })),

  clearConflicts: () => set({ conflicts: [] }),

  getPendingCount: () => {
    const { conflicts } = get();
    return conflicts.filter((c) => c.resolution === "pending").length;
  },
}));
