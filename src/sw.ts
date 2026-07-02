/// <reference lib="webworker" />
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
} from "workbox-precaching";
import { registerRoute, NavigationRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

interface ExtendedNotificationOptions extends NotificationOptions {
  actions?: Array<{ action: string; title: string; icon?: string }>;
  vibrate?: number[];
}

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
// APP SHELL NAVIGATION
// ============================================================================
// Serve the precached index.html for all navigations so the SPA boots offline.
// Previously navigations were network-only with a broken offline.html lookup,
// which meant reloading the PWA offline returned a network error (INFRA-01).
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// ============================================================================
// RUNTIME CACHING STRATEGIES
// ============================================================================

// 1. Supabase REST API - deliberately NOT cached. Responses are authenticated
//    financial data; Cache Storage is keyed by URL only, so cached payloads
//    would survive logout and could leak across sessions (SEC-07). Dexie is
//    the app's offline data layer; the SW must not keep a second copy.

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

    const options: ExtendedNotificationOptions = {
      body,
      icon: icon || "/icons/icon-192x192.png",
      badge: badge || "/icons/badge-72x72.png",
      data: notificationData,
      tag: notificationData?.tag || "default",
      requireInteraction: notificationData?.requireInteraction || false,
    };

    // Add action buttons for budget alerts
    if (notificationData?.tag === "budget-alert") {
      options.actions = [
        {
          action: "view-budget",
          title: "View Budget",
        },
        {
          action: "dismiss",
          title: "Dismiss",
        },
      ];
      options.vibrate = [200, 100, 200];
    }

    // Add action buttons for pending transactions
    if (notificationData?.tag === "pending-transactions") {
      options.actions = [
        {
          action: "view-transactions",
          title: "View Pending",
        },
        {
          action: "dismiss",
          title: "Dismiss",
        },
      ];
      options.vibrate = [200, 100, 200];
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
            return (client as WindowClient).navigate(new URL(targetUrl, self.location.origin).href);
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

// With registerType: "prompt" and injectManifest, the update flow is:
// 1. New SW installs and enters "waiting" state (no skipWaiting on install)
// 2. User sees UpdatePrompt and clicks "Reload Now"
// 3. updateServiceWorker(true) sends { type: 'SKIP_WAITING' } message
// 4. This message listener calls skipWaiting() → SW activates → page reloads
//
// IMPORTANT: Do NOT call skipWaiting() in the install handler — that would
// bypass the prompt and activate the new SW while the page still serves
// stale precached assets.

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", () => {
  console.log("[Service Worker] Installed, waiting for user to accept update...");
});

self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activated");
  event.waitUntil(self.clients.claim());
});

// ============================================================================
// OFFLINE FALLBACK
// ============================================================================

// Last-resort handler when a registered route fails (e.g. the precached app
// shell is missing after a cache wipe). matchPrecache resolves the revision-
// parameterized cache key that a raw caches.match("/offline.html") missed.
setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") {
    return (await matchPrecache("/offline.html")) || Response.error();
  }
  return Response.error();
});
