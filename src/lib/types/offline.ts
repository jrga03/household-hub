/**
 * Offline State Type Definitions
 *
 * Types for managing offline status, sync state, and storage quota.
 * Used by the three-layer state architecture (Zustand → IndexedDB → Supabase).
 *
 * See ARCHITECTURE.md (Three-Layer State) and SYNC-ENGINE.md (Offline Detection)
 *
 * @module types/offline
 */

/**
 * Overall offline status including storage usage.
 *
 * @property isOnline - Network connectivity status
 * @property lastSync - Timestamp of last successful sync with server
 * @property pendingChanges - Number of unsynced changes in queue
 * @property storageUsed - Bytes used in IndexedDB
 * @property storageQuota - Total bytes available in IndexedDB
 *
 * @example
 * const status: OfflineStatus = {
 *   isOnline: true,
 *   lastSync: new Date('2024-01-15T10:30:00Z'),
 *   pendingChanges: 3,
 *   storageUsed: 5242880, // 5 MB
 *   storageQuota: 52428800 // 50 MB
 * };
 */
export interface OfflineStatus {
  isOnline: boolean;
  lastSync?: Date;
  pendingChanges: number;
  storageUsed: number;
  storageQuota: number;
}

/**
 * Sync operation status with progress tracking.
 *
 * @property status - Current sync state
 * @property message - Human-readable status message (optional)
 * @property progress - Sync progress information (optional)
 * @property progress.current - Number of items synced so far
 * @property progress.total - Total number of items to sync
 *
 * @example
 * // Idle state
 * const idle: SyncStatus = {
 *   status: 'idle'
 * };
 *
 * // Syncing with progress
 * const syncing: SyncStatus = {
 *   status: 'syncing',
 *   message: 'Syncing transactions...',
 *   progress: {
 *     current: 15,
 *     total: 50
 *   }
 * };
 *
 * // Error state
 * const error: SyncStatus = {
 *   status: 'error',
 *   message: 'Network error: Failed to connect to server'
 * };
 */
export interface SyncStatus {
  status: "idle" | "syncing" | "error";
  message?: string;
  progress?: {
    current: number;
    total: number;
  };
}

/**
 * Storage quota status for monitoring and cleanup.
 *
 * @property available - Whether there's enough space for new data
 * @property percentage - Storage usage as decimal (0.0 to 1.0)
 * @property usage - Bytes currently used
 * @property quota - Total bytes available
 * @property action - Recommended action based on usage
 *
 * @example
 * const quota: StorageQuota = {
 *   available: true,
 *   percentage: 0.75, // 75% used
 *   usage: 39321600, // ~37.5 MB
 *   quota: 52428800, // 50 MB
 *   action: 'warn' // Show warning to user
 * };
 */
export interface StorageQuota {
  available: boolean;
  percentage: number;
  usage: number;
  quota: number;
  action: "none" | "warn" | "prune" | "critical";
}

/**
 * Network status for offline detection.
 *
 * @property online - Current network connectivity
 * @property offlineSince - When device went offline (if applicable)
 *
 * @example
 * const network: NetworkStatus = {
 *   online: false,
 *   offlineSince: new Date('2024-01-15T10:45:00Z')
 * };
 */
export interface NetworkStatus {
  online: boolean;
  offlineSince?: Date;
}
