# PWA Configuration & Manifest

## Overview

Complete Progressive Web App configuration for Household Hub, enabling offline functionality, installability, and native app-like experience across all platforms.

## Web App Manifest

### Complete Manifest Configuration

```json
{
  "name": "Household Hub - Financial Tracker",
  "short_name": "HouseholdHub",
  "description": "Offline-first household financial management with real-time sync",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "orientation": "any",
  "theme_color": "#1e40af",
  "background_color": "#ffffff",
  "lang": "en-US",
  "dir": "ltr",
  "categories": ["finance", "productivity", "lifestyle"],

  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],

  "screenshots": [
    {
      "src": "/screenshots/desktop-home.png",
      "sizes": "1920x1080",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Dashboard view"
    },
    {
      "src": "/screenshots/desktop-transactions.png",
      "sizes": "1920x1080",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Transaction management"
    },
    {
      "src": "/screenshots/mobile-home.png",
      "sizes": "1170x2532",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Mobile dashboard"
    },
    {
      "src": "/screenshots/mobile-add.png",
      "sizes": "1170x2532",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Add transaction"
    }
  ],

  "shortcuts": [
    {
      "name": "Add Transaction",
      "short_name": "Add",
      "description": "Quickly add a new transaction",
      "url": "/transactions/new?source=shortcut",
      "icons": [
        {
          "src": "/icons/shortcut-add.png",
          "sizes": "96x96",
          "type": "image/png"
        }
      ]
    },
    {
      "name": "View Budget",
      "short_name": "Budget",
      "description": "Check monthly budget status",
      "url": "/budget?source=shortcut",
      "icons": [
        {
          "src": "/icons/shortcut-budget.png",
          "sizes": "96x96",
          "type": "image/png"
        }
      ]
    },
    {
      "name": "Reports",
      "short_name": "Reports",
      "description": "View financial reports",
      "url": "/reports?source=shortcut",
      "icons": [
        {
          "src": "/icons/shortcut-reports.png",
          "sizes": "96x96",
          "type": "image/png"
        }
      ]
    }
  ],

  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "receipt",
          "accept": ["image/*", "application/pdf"]
        }
      ]
    }
  },

  "protocol_handlers": [
    {
      "protocol": "web+household",
      "url": "/open?url=%s"
    }
  ],

  "related_applications": [],
  "prefer_related_applications": false,

  "iarc_rating_id": "",

  "file_handlers": [
    {
      "action": "/import",
      "accept": {
        "text/csv": [".csv"],
        "application/vnd.ms-excel": [".xls"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]
      }
    }
  ],

  "launch_handler": {
    "client_mode": ["focus-existing", "auto"]
  },

  "edge_side_panel": {
    "preferred_width": 400
  }
}
```

## iOS-Specific Configuration

### Meta Tags for iOS Safari

```html
<!-- iOS Safari -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="HouseholdHub" />

<!-- iOS Icons -->
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152x152.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180x180.png" />
<link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167x167.png" />

<!-- iOS Splash Screens -->
<!-- iPhone X, XS, 11 Pro -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
  href="/splash/iphone-x.png"
/>

<!-- iPhone XR, 11 -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)"
  href="/splash/iphone-xr.png"
/>

<!-- iPhone XS Max, 11 Pro Max -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)"
  href="/splash/iphone-xs-max.png"
/>

<!-- iPhone 12, 13, 14 -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
  href="/splash/iphone-12.png"
/>

<!-- iPhone 12, 13, 14 Pro Max -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"
  href="/splash/iphone-12-pro-max.png"
/>

<!-- iPad -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)"
  href="/splash/ipad.png"
/>

<!-- iPad Pro 11" -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)"
  href="/splash/ipad-pro-11.png"
/>

<!-- iPad Pro 12.9" -->
<link
  rel="apple-touch-startup-image"
  media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"
  href="/splash/ipad-pro-12.png"
/>
```

### iOS Limitations & Workarounds

```typescript
// iOS PWA Detection and Workarounds
export function setupIOSWorkarounds() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

  if (isIOS && isStandalone) {
    // Prevent elastic scrolling
    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.target.closest(".scrollable")) return;
        e.preventDefault();
      },
      { passive: false }
    );

    // Handle status bar tap to scroll to top
    window.addEventListener("statusTap", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // Workaround for iOS Web Push (requires iOS 16.4+)
    if ("Notification" in window && "serviceWorker" in navigator) {
      // Web Push only works in installed PWAs on iOS
      checkIOSPushSupport();
    }
  }
}

function checkIOSPushSupport() {
  // iOS 16.4+ supports Web Push for installed PWAs
  const osVersion = navigator.userAgent.match(/OS (\d+)_(\d+)/);
  if (osVersion) {
    const major = parseInt(osVersion[1]);
    const minor = parseInt(osVersion[2]);
    if (major > 16 || (major === 16 && minor >= 4)) {
      // Web Push supported
      return true;
    }
  }
  // Fallback to email notifications
  return false;
}
```

## Service Worker Configuration

### Workbox Configuration (vite-plugin-pwa)

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "apple-touch-icon.png"],

      manifest: {
        // Manifest configuration from above
      },

      workbox: {
        // Precaching
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],

        // Runtime caching
        runtimeCaching: [
          {
            // Cache API responses with NetworkFirst
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              networkTimeoutSeconds: 3,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache images with CacheFirst
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache fonts
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "font-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // Offline fallback for navigation
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "navigation-cache",
              networkTimeoutSeconds: 3,
              plugins: [
                {
                  handlerDidError: async () => {
                    return caches.match("/offline.html");
                  },
                },
              ],
            },
          },
        ],

        // Skip waiting and claim clients
        skipWaiting: true,
        clientsClaim: true,

        // Clean old caches
        cleanupOutdatedCaches: true,

        // Navigation fallback
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],

        // Source map for debugging
        sourcemap: true,
      },

      // Development options
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "/index.html",
      },
    }),
  ],
});
```

## Caching Strategies

### Cache Strategy by Resource Type

```typescript
// cache-strategies.ts
export const cacheStrategies = {
  // App shell - StaleWhileRevalidate
  appShell: {
    pattern: /^\/(?:index\.html|manifest\.json|$)/,
    strategy: "StaleWhileRevalidate",
    cacheName: "app-shell-v1",
  },

  // Static assets - CacheFirst with long expiration
  static: {
    pattern: /\.(?:js|css)$/,
    strategy: "CacheFirst",
    cacheName: "static-v1",
    expiration: {
      maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
    },
  },

  // API GET requests - NetworkFirst with timeout
  apiRead: {
    pattern: /\/rest\/v1\/.*\?.*method=GET/,
    strategy: "NetworkFirst",
    cacheName: "api-read-v1",
    networkTimeout: 3,
    expiration: {
      maxAgeSeconds: 60 * 5, // 5 minutes
    },
  },

  // API mutations - NetworkOnly with queue
  apiWrite: {
    pattern: /\/rest\/v1\/.*\?.*method=(POST|PUT|DELETE)/,
    strategy: "NetworkOnly",
    plugins: ["BackgroundSync"],
  },

  // User uploads - CacheFirst
  uploads: {
    pattern: /\/storage\/v1\/object\//,
    strategy: "CacheFirst",
    cacheName: "uploads-v1",
    expiration: {
      maxEntries: 50,
      maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
    },
  },
};
```

## Background Sync

### Offline Queue Implementation

```typescript
// background-sync.ts
import { Queue } from "workbox-background-sync";

// Create queue for failed requests
const queue = new Queue("offline-transactions", {
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        const response = await fetch(entry.request.clone());

        if (response.ok) {
          // Notify success
          const clients = await self.clients.matchAll();
          clients.forEach((client) => {
            client.postMessage({
              type: "SYNC_SUCCESS",
              payload: { url: entry.request.url },
            });
          });
        } else {
          // Re-queue if failed
          await queue.unshiftRequest(entry);
          throw new Error(`Request failed: ${response.status}`);
        }
      } catch (error) {
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  },
});

// Add failed requests to queue
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" && event.request.url.includes("/rest/v1/")) {
    const bgSync = async () => {
      try {
        const response = await fetch(event.request.clone());
        return response;
      } catch (error) {
        await queue.pushRequest({ request: event.request });
        return new Response(
          JSON.stringify({
            error: "Offline",
            queued: true,
            message: "Transaction will sync when online",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    };

    event.respondWith(bgSync());
  }
});
```

## Install Prompt

### Custom Install Experience

```tsx
// InstallPrompt.tsx
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Show custom prompt after user has used app
      const visits = parseInt(localStorage.getItem("visits") || "0");
      if (visits >= 3) {
        setShowPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Listen for successful install
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setShowPrompt(false);
      toast.success("App installed successfully!");
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show browser prompt
    deferredPrompt.prompt();

    // Wait for user choice
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      // Track installation
      gtag("event", "install", {
        event_category: "PWA",
        event_label: "accepted",
      });
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  if (installed || !showPrompt) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96
                    bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4
                    border border-gray-200 dark:border-gray-700 z-50"
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <img src="/icons/icon-48x48.png" alt="App icon" className="w-12 h-12" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Install Household Hub
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Install our app for offline access and a better experience
          </p>
          <div className="mt-3 flex space-x-2">
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md
                       hover:bg-blue-700 focus:outline-none focus:ring-2
                       focus:ring-blue-500"
            >
              Install
            </button>
            <button
              onClick={() => setShowPrompt(false)}
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700
                       dark:text-gray-300 text-sm rounded-md hover:bg-gray-300
                       dark:hover:bg-gray-600"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Update Notifications

### Service Worker Update UI

```tsx
// UpdatePrompt.tsx
import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered:", r);
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <>
      {(offlineReady || needRefresh) && (
        <div
          className="fixed top-4 right-4 bg-white dark:bg-gray-800 rounded-lg
                      shadow-lg p-4 max-w-sm z-50"
        >
          <div className="mb-2">
            {offlineReady ? (
              <span className="text-sm text-gray-700 dark:text-gray-300">
                App ready to work offline
              </span>
            ) : (
              <span className="text-sm text-gray-700 dark:text-gray-300">
                New content available, click reload to update
              </span>
            )}
          </div>
          <div className="flex justify-end space-x-2">
            {needRefresh && (
              <button
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded
                         hover:bg-blue-700"
                onClick={() => updateServiceWorker(true)}
              >
                Reload
              </button>
            )}
            <button
              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-sm
                       rounded hover:bg-gray-300"
              onClick={close}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

## Performance Optimizations

### PWA Performance Checklist

```typescript
// performance-config.ts
export const performanceConfig = {
  // Preload critical resources
  preload: ["/fonts/inter-var.woff2", "/js/app.js", "/css/app.css"],

  // Prefetch likely navigation
  prefetch: ["/transactions", "/budget", "/reports"],

  // Lazy load heavy components
  lazyLoad: ["charts", "export-modal", "import-wizard"],

  // Resource hints
  resourceHints: {
    dns: ["https://api.supabase.co"],
    preconnect: ["https://api.supabase.co", "https://cdn.jsdelivr.net"],
    prefetch: ["/api/transactions?limit=50"],
  },

  // Bundle splitting
  chunks: {
    vendor: ["react", "react-dom"],
    ui: ["@tanstack/react-table", "recharts"],
    utils: ["date-fns", "zod"],
  },
};
```

## Testing PWA Features

### Lighthouse PWA Audit

```bash
# Run Lighthouse audit
npx lighthouse https://localhost:5173 \
  --view \
  --preset=desktop \
  --output-path=./lighthouse-report.html

# Specific PWA checks
npx lighthouse https://localhost:5173 \
  --only-categories=pwa \
  --view
```

### Manual PWA Testing Checklist

```markdown
## Installation

- [ ] Install prompt appears after 3+ visits
- [ ] App installs successfully on desktop Chrome
- [ ] App installs successfully on Android Chrome
- [ ] App installs successfully on iOS Safari (Add to Home Screen)
- [ ] Shortcuts work after installation
- [ ] App opens in standalone mode

## Offline Functionality

- [ ] App loads when offline
- [ ] Can view cached transactions offline
- [ ] Can create new transactions offline
- [ ] Sync queue shows pending items
- [ ] Data syncs when returning online
- [ ] Conflict resolution works correctly

## Updates

- [ ] Update notification appears for new version
- [ ] App updates without data loss
- [ ] Skip waiting works correctly

## Platform-Specific

- [ ] iOS: Status bar styling correct
- [ ] iOS: Splash screen displays
- [ ] Android: Theme color in task switcher
- [ ] Desktop: Window controls overlay works

## Performance

- [ ] Lighthouse PWA score > 90
- [ ] First paint < 2s on 3G
- [ ] Service worker caches correctly
- [ ] No console errors
```

## Troubleshooting

### Common PWA Issues

1. **Install prompt not showing**
   - Ensure HTTPS (or localhost)
   - Check manifest is valid
   - Verify service worker registered
   - Meet Chrome's installability criteria

2. **iOS limitations**
   - No install prompt (use custom UI)
   - Limited to 50MB storage
   - No background sync (use fallback)
   - Web Push requires iOS 16.4+

3. **Service worker not updating**
   - Check skipWaiting configuration
   - Clear browser cache
   - Verify versioning strategy
   - Check for console errors

4. **Offline not working**
   - Verify cache strategies
   - Check network-first timeout
   - Ensure fallback pages cached
   - Test service worker scope

## Deployment Checklist

- [ ] Valid SSL certificate
- [ ] Manifest at root path
- [ ] All icon sizes provided
- [ ] Service worker registered
- [ ] Offline page created
- [ ] Cache headers configured
- [ ] CSP headers allow worker
- [ ] robots.txt updated
- [ ] sitemap.xml includes app URLs
- [ ] Analytics tracking PWA events
