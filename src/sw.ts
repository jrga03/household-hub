/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

/**
 * Custom Service Worker for Household Hub PWA
 *
 * This service worker extends Vite PWA's functionality with:
 * - Push notification handlers
 * - Notification click routing
 * - All existing Workbox caching strategies from chunk 042
 *
 * Strategy Change: From generateSW (auto-generated) to injectManifest (custom)
 * This allows us to add push event handlers while preserving caching logic.
 */

// ============================================================================
// PRECACHING (from Vite PWA manifest)
// ============================================================================
// Precache all static assets defined by Vite build
// The __WB_MANIFEST placeholder is replaced by Workbox during build
precacheAndRoute(self.__WB_MANIFEST || []);

// Cleanup outdated caches automatically
cleanupOutdatedCaches();

// ============================================================================
// RUNTIME CACHING STRATEGIES (from chunk 042 vite.config.ts)
// ============================================================================

// 1. Supabase API - Network First (5-minute cache with validation)
registerRoute(
  ({ url }) => url.hostname.includes("supabase.co") && url.pathname.includes("/rest/"),
  new NetworkFirst({
    cacheName: "supabase-api-cache",
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
        headers: {
          "content-type": "application/json",
        },
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  })
);

// 2. Supabase Storage - Cache First (7-day cache)
registerRoute(
  ({ url }) => url.hostname.includes("supabase.co") && url.pathname.includes("/storage/"),
  new CacheFirst({
    cacheName: "supabase-storage-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
    ],
  })
);

// 3. Authentication - Network Only (NEVER cache sensitive data)
registerRoute(
  ({ url }) => url.hostname.includes("supabase.co") && url.pathname.includes("/auth/"),
  new NetworkOnly()
);

// 4. Google Fonts - Stale While Revalidate (1-year cache)
registerRoute(
  ({ url }) => url.hostname === "fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
);

// ============================================================================
// PUSH NOTIFICATION HANDLERS
// ============================================================================

/**
 * Push Event Handler
 *
 * Triggered when the service worker receives a push notification from
 * the push service (via Cloudflare Worker).
 *
 * Displays the notification to the user even when the app is closed.
 */
self.addEventListener("push", (event: PushEvent) => {
  console.log("[Service Worker] Push notification received", event);

  if (!event.data) {
    console.warn("[Service Worker] Push event has no data");
    return;
  }

  try {
    const data = event.data.json();
    const { title, body, icon, badge, data: notificationData } = data;

    const options: NotificationOptions = {
      body,
      icon: icon || "/icons/icon-192x192.png",
      badge: badge || "/icons/badge-72x72.png",
      data: notificationData,
      tag: notificationData?.tag || "default",
      requireInteraction: notificationData?.requireInteraction || false,
    };

    // Add action buttons for budget alerts
    if (notificationData?.tag === "budget-alert") {
      (options as any).actions = [
        {
          action: "view-budget",
          title: "View Budget",
        },
        {
          action: "dismiss",
          title: "Dismiss",
        },
      ];
      (options as any).vibrate = [200, 100, 200];
    }

    // Add action buttons for pending transactions
    if (notificationData?.tag === "pending-transactions") {
      (options as any).actions = [
        {
          action: "view-transactions",
          title: "View Pending",
        },
        {
          action: "dismiss",
          title: "Dismiss",
        },
      ];
      (options as any).vibrate = [200, 100, 200];
    }

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error("[Service Worker] Error handling push event:", error);
  }
});

/**
 * Notification Click Handler
 *
 * Handles user interactions with notifications:
 * - Clicking the notification opens/focuses the app
 * - Routes to relevant page based on notification type
 * - Handles action buttons (View Budget, View Pending, etc.)
 */
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  console.log("[Service Worker] Notification clicked", event);

  event.notification.close();

  const data = event.notification.data;
  const action = event.action;

  // Determine target URL based on notification type and action
  let targetUrl = "/";

  if (action === "dismiss") {
    // User clicked dismiss - just close the notification
    return;
  }

  if (action === "view-budget" || data?.budgetId) {
    targetUrl = "/budgets";
  } else if (action === "view-transactions" || data?.tag === "pending-transactions") {
    targetUrl = data?.url || "/transactions?status=pending";
  } else if (data?.url) {
    targetUrl = data.url;
  }

  // Open or focus existing window
  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // Try to focus existing window with the target URL
        for (const client of clientList) {
          if (client.url.includes(new URL(targetUrl, self.location.origin).pathname)) {
            if ("focus" in client) {
              return client.focus();
            }
          }
        }

        // If no matching window, try to focus any open window and navigate
        if (clientList.length > 0) {
          const client = clientList[0];
          if ("focus" in client) {
            client.focus();
          }
          if ("navigate" in client) {
            return (client as any).navigate(new URL(targetUrl, self.location.origin).href);
          }
        }

        // No open windows - open new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(new URL(targetUrl, self.location.origin).href);
        }
      })
  );
});

/**
 * Notification Close Handler
 *
 * Optional: Track when users dismiss notifications without clicking.
 * Useful for analytics to understand notification engagement.
 */
self.addEventListener("notificationclose", (event: NotificationEvent) => {
  console.log("[Service Worker] Notification closed", event.notification.tag);
  // Optional: Send analytics event about notification dismissal
});

// ============================================================================
// SERVICE WORKER LIFECYCLE
// ============================================================================

/**
 * Install Event
 *
 * Triggered when service worker is first installed.
 * Skip waiting to activate immediately.
 */
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing...");
  event.waitUntil(self.skipWaiting());
});

/**
 * Activate Event
 *
 * Triggered when service worker activates.
 * Claim all clients immediately.
 */
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating...");
  event.waitUntil(self.clients.claim());
});

// ============================================================================
// OFFLINE FALLBACK
// ============================================================================

// Navigate fallback for offline (reuse existing offline.html from chunk 042)
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedResponse = await caches.match("/offline.html");
        return cachedResponse || Response.error();
      })
    );
  }
});
