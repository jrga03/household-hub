import { create } from "zustand";

/**
 * Sync Store - Tracks realtime connection and sync status
 *
 * This store manages the application's sync state across three key dimensions:
 * 1. Connection status (online/offline/syncing/error)
 * 2. Last successful sync timestamp
 * 3. Number of pending changes waiting to sync
 *
 * Used by:
 * - SyncIndicator component for UI feedback
 * - RealtimeSync service for status updates
 * - Sync queue processor for pending count tracking
 */

export type SyncStatus = "online" | "offline" | "syncing" | "error";

interface SyncStore {
  // State
  status: SyncStatus;
  lastSyncTime: Date | null;
  pendingChanges: number;

  // Actions
  setStatus: (status: SyncStatus) => void;
  setLastSyncTime: (time: Date) => void;
  setPendingChanges: (count: number) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  // Initial state
  status: "online",
  lastSyncTime: null,
  pendingChanges: 0,

  // Actions
  setStatus: (status) => set({ status }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setPendingChanges: (count) => set({ pendingChanges: count }),
}));
