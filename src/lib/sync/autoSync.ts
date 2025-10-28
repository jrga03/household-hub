/**
 * Auto-Sync Manager - Automatic Sync Triggers for Offline-First Apps
 *
 * Core responsibility: Automatically trigger sync operations in response to browser
 * events, providing iOS Safari Background Sync API fallback and multi-device sync.
 *
 * Problem Context:
 * - iOS Safari doesn't support the Background Sync API
 * - Need reliable sync triggers for offline-first apps
 * - Must handle network reconnection, tab visibility, and periodic sync
 *
 * Key Features:
 * - 4 event-based sync triggers (online, visibility, focus, periodic)
 * - 5-minute periodic sync when tab is visible
 * - Graceful error handling (app continues if sync fails)
 * - Singleton pattern for global sync coordination
 * - Clean lifecycle management (start/stop)
 *
 * Sync Triggers (Priority Order):
 * 1. **online** - Network connection restored (navigator.onLine === true)
 * 2. **visibilitychange** - Tab becomes visible (!document.hidden)
 * 3. **focus** - Window regains focus (user returns to app)
 * 4. **periodic** - Every 5 minutes (only when tab is visible)
 *
 * Sync Conditions:
 * - Only trigger sync if navigator.onLine === true (network available)
 * - Periodic sync only runs when !document.hidden (tab is visible)
 * - All triggers call unified triggerSync() method
 *
 * Lifecycle Management:
 * ```typescript
 * // On user login
 * autoSyncManager.start(userId);
 *
 * // On user logout
 * autoSyncManager.stop();
 * ```
 *
 * Usage Pattern (AuthStore Integration):
 * ```typescript
 * // In authStore.ts signIn method:
 * const { data, error } = await supabase.auth.signInWithPassword({ email, password });
 * if (data.user) {
 *   autoSyncManager.start(data.user.id);
 * }
 *
 * // In authStore.ts signOut method:
 * await supabase.auth.signOut();
 * autoSyncManager.stop();
 * ```
 *
 * iOS Safari Fallback Strategy:
 * - Background Sync API not supported → use event listeners instead
 * - online event: Immediate sync when network restored
 * - visibilitychange: Sync when tab becomes visible (user switches back)
 * - focus: Sync when window regains focus (covers edge cases)
 * - periodic: Fallback for long-running sessions (5-minute interval)
 *
 * Event Listener Management:
 * - Arrow functions preserve `this` context (no .bind() needed)
 * - All listeners registered in setupEventListeners()
 * - All listeners removed in cleanup() (prevents memory leaks)
 * - intervalId stored for periodic sync cleanup
 *
 * Error Handling Philosophy:
 * - Sync failures are logged but not thrown (non-blocking)
 * - App remains functional if sync fails (offline-first design)
 * - Sync processor handles retry logic internally
 *
 * See SYNC-ENGINE.md lines 1123-1303 for iOS Safari background sync strategy.
 * See SYNC-FALLBACKS.md for complete fallback mechanism details.
 * See instructions.md Step 6 (lines 385-468) for implementation spec.
 *
 * @module sync/autoSync
 */

import { syncProcessor } from "./processor";

/**
 * AutoSyncManager - Coordinates automatic sync triggers across browser events
 *
 * Singleton class that manages event listeners for automatic sync triggers.
 * Handles iOS Safari Background Sync API fallback with 4 event-based triggers.
 *
 * State:
 * - intervalId: Periodic sync timer (cleared on stop)
 * - userId: Authenticated user ID (required for sync operations)
 *
 * Lifecycle:
 * 1. start(userId) - Initialize event listeners and periodic sync
 * 2. [Event triggers sync operations during app session]
 * 3. stop() - Cleanup all listeners and intervals
 */
export class AutoSyncManager {
  /**
   * Interval ID for periodic sync timer (5-minute interval)
   * Stored for cleanup in stop() method
   */
  private intervalId?: number;

  /**
   * Current authenticated user ID
   * Required to call syncProcessor.processQueue(userId)
   */
  private userId?: string;

  /**
   * Start auto-sync manager for authenticated user
   *
   * Initializes all event listeners (online, visibility, focus) and starts
   * the 5-minute periodic sync timer. Call this after successful login.
   *
   * @param userId - Authenticated user ID from Supabase Auth
   *
   * @example
   * ```typescript
   * // In authStore signIn method:
   * const { data } = await supabase.auth.signInWithPassword({ email, password });
   * if (data.user) {
   *   autoSyncManager.start(data.user.id);
   * }
   * ```
   */
  start(userId: string): void {
    this.userId = userId;
    this.setupEventListeners();
    this.startPeriodicSync();
    console.log(`[AutoSync] Started for user ${userId}`);
  }

  /**
   * Stop auto-sync manager and cleanup all resources
   *
   * Removes all event listeners and clears periodic sync interval.
   * Call this on user logout to prevent memory leaks.
   *
   * @example
   * ```typescript
   * // In authStore signOut method:
   * await supabase.auth.signOut();
   * autoSyncManager.stop();
   * ```
   */
  stop(): void {
    this.cleanup();
    this.userId = undefined;
    console.log("[AutoSync] Stopped");
  }

  /**
   * Setup all event listeners for sync triggers
   *
   * Private method called by start(). Registers 3 event listeners:
   * 1. window 'online' - Network connection restored
   * 2. document 'visibilitychange' - Tab visibility changed
   * 3. window 'focus' - Window regained focus
   *
   * Uses arrow functions to preserve `this` context (no .bind() needed).
   */
  private setupEventListeners(): void {
    // Trigger on online (network connection restored)
    window.addEventListener("online", this.handleOnline);

    // Trigger on visibility change (tab becomes visible)
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    // Trigger on focus (window regains focus)
    window.addEventListener("focus", this.handleFocus);
  }

  /**
   * Handle 'online' event - network connection restored
   *
   * Triggers immediate sync when device reconnects to network.
   * Critical for offline-first apps to sync queued changes.
   *
   * Arrow function preserves `this` context for event listener.
   */
  private handleOnline = async () => {
    console.log("[AutoSync] Online - triggering sync");
    await this.triggerSync();
  };

  /**
   * Handle 'visibilitychange' event - tab visibility changed
   *
   * Triggers sync when tab becomes visible (!document.hidden).
   * Covers iOS Safari case where user switches back to app.
   *
   * Arrow function preserves `this` context for event listener.
   */
  private handleVisibilityChange = async () => {
    if (!document.hidden) {
      console.log("[AutoSync] Visible - triggering sync");
      await this.triggerSync();
    }
  };

  /**
   * Handle 'focus' event - window regained focus
   *
   * Triggers sync when window regains focus (user returns to app).
   * Covers edge cases missed by visibilitychange on some browsers.
   *
   * Arrow function preserves `this` context for event listener.
   */
  private handleFocus = async () => {
    console.log("[AutoSync] Focused - triggering sync");
    await this.triggerSync();
  };

  /**
   * Start periodic sync timer (5-minute interval)
   *
   * Private method called by start(). Runs sync every 5 minutes
   * as fallback for long-running sessions. Only syncs when:
   * - navigator.onLine === true (network available)
   * - !document.hidden (tab is visible)
   *
   * Interval ID stored in this.intervalId for cleanup.
   */
  private startPeriodicSync(): void {
    // Sync every 5 minutes (5 * 60 * 1000 milliseconds)
    this.intervalId = window.setInterval(
      () => {
        // Only sync if online AND tab is visible
        if (navigator.onLine && !document.hidden) {
          console.log("[AutoSync] Periodic - triggering sync");
          this.triggerSync();
        }
      },
      5 * 60 * 1000
    );
  }

  /**
   * Trigger sync operation (unified method for all event handlers)
   *
   * Private method called by all event handlers (online, visibility, focus, periodic).
   * Delegates to syncProcessor.processQueue() with error handling.
   *
   * Error Handling:
   * - Errors are logged but NOT thrown (non-blocking)
   * - App continues to function if sync fails
   * - Sync processor handles retry logic internally
   *
   * Conditions:
   * - Only runs if this.userId is set (user is authenticated)
   * - Navigator.onLine check happens in event handlers
   */
  private async triggerSync(): Promise<void> {
    if (!this.userId) {
      console.warn("[AutoSync] No userId - skipping sync");
      return;
    }

    try {
      const result = await syncProcessor.processQueue(this.userId);
      if (result.synced > 0 || result.failed > 0) {
        console.log(
          `[AutoSync] Sync completed - synced: ${result.synced}, failed: ${result.failed}`
        );
      }
    } catch (error) {
      // Log error but don't throw (graceful degradation)
      console.error("[AutoSync] Sync failed:", error);
    }
  }

  /**
   * Cleanup all event listeners and intervals
   *
   * Private method called by stop(). Removes all event listeners
   * and clears periodic sync interval to prevent memory leaks.
   *
   * Critical for proper resource management on logout.
   */
  private cleanup(): void {
    // Remove event listeners (same functions used in setupEventListeners)
    window.removeEventListener("online", this.handleOnline);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("focus", this.handleFocus);

    // Clear periodic sync interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

/**
 * Singleton instance of AutoSyncManager
 *
 * Export single global instance for app-wide sync coordination.
 * Import and use this instance in authStore and other modules.
 *
 * @example
 * ```typescript
 * import { autoSyncManager } from "@/lib/sync/autoSync";
 *
 * // On login
 * autoSyncManager.start(userId);
 *
 * // On logout
 * autoSyncManager.stop();
 * ```
 */
export const autoSyncManager = new AutoSyncManager();
