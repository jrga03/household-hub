# Instructions: Service Worker

Follow these steps in order. Estimated time: 1.5 hours.

---

## Step 1: Enhance Vite PWA Config (20 min)

Update `vite.config.ts` with comprehensive Workbox configuration:

```typescript
VitePWA({
  registerType: "prompt", // Changed from 'autoUpdate' to allow user control
  includeAssets: ["icons/*.png", "splash/*.jpg", "offline.html"],

  manifest: {
    // ... existing manifest config from chunk 041
  },

  workbox: {
    // Cache all static assets
    globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],

    // Don't cache these
    globIgnores: ["**/node_modules/**/*"],

    // Runtime caching strategies
    runtimeCaching: [
      // Supabase API - Network First
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "supabase-api-cache",
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 5 * 60, // 5 minutes
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },

      // Supabase Storage - Cache First
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "supabase-storage-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
          },
        },
      },

      // Google Fonts - Stale While Revalidate
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "google-fonts-cache",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
    ],

    // Navigate fallback for offline
    navigateFallback: "/offline.html",
    navigateFallbackDenylist: [/^\/api\//],

    // Cleanup old caches
    cleanupOutdatedCaches: true,
  },

  devOptions: {
    enabled: true,
    type: "module",
  },
});
```

---

## Step 2: Create Offline Fallback Page (10 min)

Create `public/offline.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Offline - Household Hub</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family:
          -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        padding: 2rem;
      }

      .container {
        text-align: center;
        max-width: 500px;
      }

      .icon {
        font-size: 4rem;
        margin-bottom: 1rem;
      }

      h1 {
        font-size: 2rem;
        margin-bottom: 1rem;
      }

      p {
        font-size: 1.125rem;
        margin-bottom: 2rem;
        opacity: 0.9;
      }

      .button {
        display: inline-block;
        padding: 1rem 2rem;
        background: #fff;
        color: #667eea;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        transition: transform 0.2s;
      }

      .button:hover {
        transform: translateY(-2px);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">📡</div>
      <h1>You're Offline</h1>
      <p>
        It looks like you've lost your internet connection. Don't worry though - Household Hub works
        offline!
      </p>
      <p>
        Your cached data is still available. Any changes you make will sync automatically when
        you're back online.
      </p>
      <a href="/" class="button">Return to App</a>
    </div>
  </body>
</html>
```

---

## Step 3: Create Service Worker Hook (15 min)

Create `src/hooks/useServiceWorker.ts`:

```typescript
import { useState, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function useServiceWorker() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      console.log("SW registered:", registration);
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      console.log("App is online");
    };

    const handleOffline = () => {
      setIsOffline(true);
      console.log("App is offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const update = async () => {
    await updateServiceWorker(true);
  };

  return {
    needRefresh,
    update,
    dismiss: () => setNeedRefresh(false),
    isOffline,
  };
}
```

---

## Step 4: Create Update Prompt Component (15 min)

Create `src/components/UpdatePrompt.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, X } from 'lucide-react';
import { useServiceWorker } from '@/hooks/useServiceWorker';

export function UpdatePrompt() {
  const { needRefresh, update, dismiss } = useServiceWorker();

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:w-96">
      <Alert>
        <Download className="h-4 w-4" />
        <AlertTitle>Update Available</AlertTitle>
        <AlertDescription>
          A new version of Household Hub is ready. Reload to get the latest features and fixes.
        </AlertDescription>
        <div className="mt-4 flex gap-2">
          <Button onClick={update} size="sm" className="flex-1">
            Reload Now
          </Button>
          <Button onClick={dismiss} size="sm" variant="outline">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
}
```

Install Alert component:

```bash
npx shadcn-ui@latest add alert
```

---

## Step 5: Add Offline Indicator Component (10 min)

Create `src/components/OfflineIndicator.tsx`:

```typescript
import { WifiOff } from 'lucide-react';
import { useServiceWorker } from '@/hooks/useServiceWorker';

export function OfflineIndicator() {
  const { isOffline } = useServiceWorker();

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-yellow-900 px-4 py-2 text-center z-50">
      <div className="flex items-center justify-center gap-2 text-sm font-medium">
        <WifiOff className="h-4 w-4" />
        You're offline - Changes will sync when connection is restored
      </div>
    </div>
  );
}
```

---

## Step 6: Integrate Components (10 min)

Update `src/App.tsx`:

```typescript
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { OfflineIndicator } from '@/components/OfflineIndicator';

function App() {
  return (
    <>
      {/* Offline banner */}
      <OfflineIndicator />

      {/* Your app content */}
      <YourAppRoutes />

      {/* Update prompt */}
      <UpdatePrompt />
    </>
  );
}
```

---

## Step 7: Add Background Sync (iOS Fallback) (15 min)

For iOS Safari, add sync on visibility change:

Create `src/lib/background-sync.ts`:

```typescript
/**
 * Background sync fallback for browsers that don't support Background Sync API
 * (primarily iOS Safari)
 */

let syncHandler: (() => Promise<void>) | null = null;

export function registerBackgroundSync(handler: () => Promise<void>) {
  syncHandler = handler;

  // Listen for app coming back to foreground
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      console.log("App visible and online - triggering sync");
      await syncHandler?.();
    }
  });

  // Listen for online event
  window.addEventListener("online", async () => {
    console.log("Connection restored - triggering sync");
    await syncHandler?.();
  });
}

// Usage in your app:
// registerBackgroundSync(async () => {
//   await syncQueueProcessor.processQueue();
// });
```

---

## Step 8: Test Service Worker (15 min)

```bash
# Build with service worker
npm run build

# Preview
npm run preview
```

**Manual Tests**:

1. **Cache verification**:
   - DevTools → Application → Cache Storage
   - Verify caches created: `workbox-precache`, `supabase-api-cache`, etc.

2. **Offline test**:
   - DevTools → Network → Throttling → Offline
   - Navigate app - should load from cache

3. **Update test**:
   - Make a code change
   - Rebuild: `npm run build`
   - Refresh app
   - Verify update prompt appears

---

## Done!

When service worker caches assets and offline mode works, proceed to checkpoint.

**Next**: Run through `checkpoint.md`
