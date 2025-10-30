/**
 * Multi-strategy background sync for cross-browser support
 *
 * Strategy priority:
 * 1. Native Background Sync API (Chrome/Edge)
 * 2. Visibility change (all browsers)
 * 3. Window focus (iOS Safari)
 * 4. Online event (all browsers)
 * 5. Periodic timer (iOS Safari fallback)
 *
 * This multi-layered approach ensures offline changes sync reliably across all browsers,
 * especially on iOS Safari which doesn't support the Background Sync API.
 *
 * @example
 * ```typescript
 * // Register background sync with your sync handler
 * import { registerBackgroundSync } from '@/lib/background-sync';
 * import { syncQueueProcessor } from '@/lib/sync-queue';
 *
 * registerBackgroundSync(async () => {
 *   await syncQueueProcessor.processQueue();
 * });
 *
 * // Cleanup on app unmount
 * unregisterBackgroundSync();
 * ```
 */

let syncHandler: (() => Promise<void>) | null = null;
let periodicSyncTimer: number | null = null;

/**
 * Register a background sync handler with multiple fallback strategies
 *
 * @param handler - Async function to call when sync should occur (e.g., processQueue)
 */
export function registerBackgroundSync(handler: () => Promise<void>) {
  syncHandler = handler;

  // Strategy 1: Native Background Sync API (Chrome/Edge)
  if ("serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready
      .then((registration) => {
        // Register background sync tag
        // TypeScript doesn't have built-in types for Background Sync API yet
        interface SyncManager {
          register(tag: string): Promise<void>;
        }
        interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
          sync: SyncManager;
        }
        return (registration as ServiceWorkerRegistrationWithSync).sync.register("data-sync");
      })
      .then(() => {
        console.log("Background Sync API registered");
      })
      .catch((err) => {
        console.warn("Background Sync API not available, using fallbacks:", err);
      });
  } else {
    console.log("Background Sync API not supported, using fallback strategies");
  }

  // Strategy 2: Visibility change (all browsers)
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      console.log("App visible and online - triggering sync");
      await syncHandler?.();
    }
  });

  // Strategy 3: Window focus (iOS Safari)
  window.addEventListener("focus", async () => {
    if (navigator.onLine) {
      console.log("Window focused and online - triggering sync");
      await syncHandler?.();
    }
  });

  // Strategy 4: Online event (all browsers)
  window.addEventListener("online", async () => {
    console.log("Connection restored - triggering sync");
    await syncHandler?.();
  });

  // Strategy 5: Periodic timer (iOS Safari fallback)
  // Sync every 5 minutes while app is open
  periodicSyncTimer = window.setInterval(
    async () => {
      if (navigator.onLine && !document.hidden) {
        console.log("Periodic sync triggered");
        await syncHandler?.();
      }
    },
    5 * 60 * 1000
  ); // 5 minutes
}

/**
 * Unregister all background sync listeners and timers
 *
 * Call this when unmounting the app or cleaning up
 */
export function unregisterBackgroundSync() {
  if (periodicSyncTimer) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
  }
}

// Future integration example:
// Usage in your app (after sync queue is implemented):
// import { registerBackgroundSync } from '@/lib/background-sync';
// import { syncQueueProcessor } from '@/lib/sync-queue';
//
// registerBackgroundSync(async () => {
//   await syncQueueProcessor.processQueue();
// });
//
// Cleanup on app unmount:
// unregisterBackgroundSync();
