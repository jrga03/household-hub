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

/**
 * Custom Service Worker for Household Hub PWA
 *
 * Workbox precaching, app-shell navigation and runtime caching, plus the
 * prompt-driven update flow (injectManifest, so the worker stays ours).
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
//    would survive logout and could leak across sessions (SEC-07). IndexedDB
//    is the app's offline data layer; the SW must not keep a second copy.

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
    event.waitUntil(self.skipWaiting());
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
