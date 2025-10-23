# Verification: Service Worker

This guide helps you verify that chunk 042 was implemented correctly.

---

## Automated Pre-Flight Checks

Run these commands before starting manual verification:

```bash
# 1. Verify Vite PWA plugin installed
grep -q "vite-plugin-pwa" package.json && echo "✅ Vite PWA plugin installed" || echo "❌ Missing vite-plugin-pwa"

# 2. Check Vite config has PWA plugin
grep -q "VitePWA" vite.config.ts && echo "✅ PWA plugin configured" || echo "❌ PWA plugin not in config"

# 3. Verify offline fallback page exists
test -f public/offline.html && echo "✅ Offline fallback page created" || echo "❌ Missing offline.html"

# 4. Check background sync file exists
test -f src/lib/background-sync.ts && echo "✅ Background sync module created" || echo "❌ Missing background-sync.ts"

# 5. Check hooks exist
test -f src/hooks/useServiceWorker.ts && echo "✅ Service worker hook created" || echo "❌ Missing useServiceWorker.ts"

# 6. Check components exist
test -f src/components/UpdatePrompt.tsx && echo "✅ Update prompt component created" || echo "❌ Missing UpdatePrompt.tsx"
test -f src/components/OfflineIndicator.tsx && echo "✅ Offline indicator created" || echo "❌ Missing OfflineIndicator.tsx"

# 7. Verify build succeeds
npm run build && echo "✅ Build successful with service worker" || echo "❌ Build failed"
```

---

## Build Verification

### 1. Service Worker Generated ✓

After running `npm run build`, verify:

```bash
# Check service worker files exist
ls dist/sw.js dist/workbox-*.js 2>/dev/null && echo "✅ Service worker files generated" || echo "❌ No service worker files"

# Check manifest updated
test -f dist/manifest.webmanifest && echo "✅ Manifest generated" || echo "❌ Missing manifest"
```

**Expected output:**

```
dist/
├── sw.js                    # Service worker
├── workbox-*.js             # Workbox runtime
└── manifest.webmanifest     # PWA manifest
```

---

## Browser Verification (Development)

### 2. Service Worker Registers in Dev Mode ✓

```bash
# Start dev server
npm run dev
```

Open DevTools → Application → Service Workers

**Check:**

- [ ] Status shows "activated and is running" with green dot
- [ ] Scope is "/"
- [ ] Source points to dev server
- [ ] "Update on reload" checkbox available

**Common issue:** If not appearing, check `vite.config.ts` has:

```typescript
devOptions: {
  enabled: true,
  type: "module",
}
```

---

## Browser Verification (Production)

### 3. Production Service Worker Works ✓

```bash
# Build and preview
npm run build
npm run preview
```

Open preview URL (usually http://localhost:4173)

#### 3.1 Registration Check

DevTools → Application → Service Workers

**Verify:**

- [ ] Service worker status: "activated and is running"
- [ ] Update button available
- [ ] Can unregister and re-register

#### 3.2 Cache Storage Check

DevTools → Application → Cache Storage

**Expected caches:**

- [ ] `workbox-precache-v2-<hash>` (static assets)
- [ ] `supabase-api-cache` (API responses)
- [ ] `supabase-storage-cache` (storage files)
- [ ] `google-fonts-cache` (fonts)

Click on `workbox-precache` and verify contents:

- [ ] index.html
- [ ] JavaScript bundles (.js files)
- [ ] CSS files (.css files)
- [ ] Icons and images

---

## Offline Functionality Tests

### 4. Offline Mode Works ✓

With app loaded in browser:

1. **Go offline**: DevTools → Network → Throttling → Offline
2. **Refresh page**: Ctrl+R / Cmd+R
3. **Expected**: App loads from cache
4. **Navigate**: Try clicking different routes
5. **Expected**: App navigation works

**Check offline indicator:**

- [ ] Yellow banner appears at top
- [ ] Shows "You're offline" message
- [ ] WiFi-off icon visible

### 5. Offline Fallback Page ✓

1. Clear all caches: DevTools → Application → Clear storage → Clear site data
2. Go offline: Network → Offline
3. Try to visit a new route not in cache
4. **Expected**: `/offline.html` displays
5. **Verify**:
   - [ ] Purple gradient background
   - [ ] "You're Offline" heading
   - [ ] 📡 emoji visible
   - [ ] "Return to App" button works when back online

---

## Caching Strategy Verification

### 6. Network-First Strategy (API) ✓

DevTools → Network tab

1. **With internet**: Make API request
   - **Expected**: Request goes to network (200 status)
2. **Go offline**: Network → Offline
3. **Same request**: Repeat the API call
   - **Expected**: Served from cache (status shows "from ServiceWorker")

### 7. Cache-First Strategy (Static Assets) ✓

1. **First load**: Note JS bundle network request
2. **Reload page**: Refresh browser
3. **Expected**: JS served from service worker
4. Network tab shows: `(from ServiceWorker)` or `(from disk cache)`

### 8. Auth Endpoints NOT Cached ✓

**Critical security test:**

1. DevTools → Network tab
2. Make authentication request (`/auth/login` or `/auth/token`)
3. Go to Application → Cache Storage
4. Check all caches
5. **Expected**: NO auth endpoints cached
6. **Verify**: Search all caches for `/auth/` - should find nothing

```bash
# In browser console:
caches.keys().then(names => {
  names.forEach(name => {
    caches.open(name).then(cache => {
      cache.keys().then(keys => {
        const authKeys = keys.filter(k => k.url.includes('/auth/'));
        if (authKeys.length > 0) {
          console.error('🚨 SECURITY ISSUE: Auth endpoints are cached!', authKeys);
        } else {
          console.log('✅ Auth endpoints NOT cached (correct)');
        }
      });
    });
  });
});
```

---

## Update Prompt Verification

### 9. Update Prompt Appears ✓

**Test update flow:**

1. Build and run: `npm run build && npm run preview`
2. Open app in browser
3. Make a code change (edit any file)
4. Rebuild: `npm run build`
5. Wait ~60 seconds or refresh page
6. **Expected**: Update prompt appears bottom-right

**Verify prompt:**

- [ ] Shows "Update Available" title
- [ ] Download icon visible
- [ ] "Reload Now" button present
- [ ] X (dismiss) button present

**Test actions:**

- [ ] Click "Reload Now" → Page reloads with new version
- [ ] Click X → Prompt disappears

---

## Background Sync Verification

### 10. Background Sync Strategies Work ✓

**Strategy 1: Native Background Sync (Chrome/Edge only)**

```javascript
// In browser console (Chrome/Edge):
navigator.serviceWorker.ready
  .then((reg) => {
    return reg.sync.register("test-sync");
  })
  .then(() => {
    console.log("✅ Background Sync API works");
  })
  .catch((err) => {
    console.log("❌ Background Sync API not available:", err);
  });
```

**Strategy 2: Visibility Change**

1. Open app
2. Switch to another tab/app
3. Switch back to app tab
4. **Expected**: Console shows "App visible and online - triggering sync"

**Strategy 3: Window Focus**

1. Click on another window
2. Click back on browser window
3. **Expected**: Console shows "Window focused and online - triggering sync"

**Strategy 4: Online Event**

1. Go offline: DevTools → Network → Offline
2. Go back online: Network → Online
3. **Expected**: Console shows "Connection restored - triggering sync"

**Strategy 5: Periodic Timer (iOS Safari)**

1. Keep app open for 5+ minutes
2. Check console
3. **Expected**: Every 5 minutes, see "Periodic sync triggered"

**Test cleanup:**

```javascript
// In console:
import { unregisterBackgroundSync } from "@/lib/background-sync";
unregisterBackgroundSync();
// Verify timer stops
```

---

## Cross-Browser Testing

### 11. Chrome/Edge Testing ✓

- [ ] Service worker registers
- [ ] Offline mode works
- [ ] Update prompt appears
- [ ] Background Sync API works
- [ ] All caches created

### 12. Firefox Testing ✓

- [ ] Service worker registers
- [ ] Offline mode works
- [ ] Caching strategies work
- [ ] Fallback sync strategies work (no native Background Sync)

### 13. Safari (Desktop) Testing ✓

- [ ] Service worker registers
- [ ] Offline mode works
- [ ] Cache strategies work
- [ ] Fallback sync strategies active

### 14. iOS Safari Testing ✓

**Critical for this project (CLAUDE.md specifies iOS support):**

- [ ] Service worker registers
- [ ] Offline mode works
- [ ] Visibility change sync works
- [ ] Window focus sync works
- [ ] Periodic timer sync works (5min intervals)
- [ ] App works in standalone mode (added to home screen)

**Known limitations (expected):**

- ❌ Native Background Sync API (not supported)
- ❌ Periodic Background Sync API (not supported)
- ✅ Manual sync fallbacks compensate

---

## Performance Verification

### 15. Cache Size Reasonable ✓

DevTools → Application → Cache Storage

**Check total cache size:**

```javascript
// In console:
navigator.storage.estimate().then(({ usage, quota }) => {
  const usedMB = (usage / 1024 / 1024).toFixed(2);
  const quotaMB = (quota / 1024 / 1024).toFixed(2);
  const percent = ((usage / quota) * 100).toFixed(1);
  console.log(`Storage: ${usedMB}MB / ${quotaMB}MB (${percent}%)`);
});
```

**Expected:**

- [ ] Total usage < 50MB for typical app
- [ ] Usage < 10% of available quota
- [ ] No single cache > 25MB

### 16. Load Performance ✓

**First load (no cache):**

DevTools → Network → Disable cache → Reload

- [ ] FCP < 1.5s
- [ ] TTI < 3.5s
- [ ] All assets load

**Subsequent load (cached):**

DevTools → Network → Reload (cache enabled)

- [ ] FCP < 0.5s (instant from cache)
- [ ] Most assets from service worker
- [ ] API calls from network (fresh data)

---

## Integration Verification

### 17. Works with App.tsx ✓

Verify components integrated:

```typescript
// src/App.tsx should have:
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { OfflineIndicator } from '@/components/OfflineIndicator';

// In JSX:
<OfflineIndicator />
{/* app content */}
<UpdatePrompt />
```

**Visual check:**

- [ ] Offline indicator appears when offline
- [ ] Update prompt appears when new version available
- [ ] Components don't block app functionality

---

## Security Verification

### 18. HTTPS Enforcement ✓

**Development:**

- [ ] Works on `localhost` (allowed exception)

**Production:**

- [ ] Only works on HTTPS domains
- [ ] HTTP redirects to HTTPS (Cloudflare Pages handles this)

### 19. Sensitive Data Not Cached ✓

**Never cached:**

- [ ] `/auth/*` endpoints
- [ ] Authentication tokens (memory only)
- [ ] User credentials

**Verify in caches:**

```javascript
// Check all caches for sensitive patterns
const sensitivePatterns = ["/auth/", "password", "token", "credential"];

caches.keys().then((names) => {
  names.forEach((name) => {
    caches.open(name).then((cache) => {
      cache.keys().then((keys) => {
        keys.forEach((req) => {
          sensitivePatterns.forEach((pattern) => {
            if (req.url.toLowerCase().includes(pattern)) {
              console.error(`🚨 SECURITY: Sensitive data cached: ${req.url}`);
            }
          });
        });
      });
    });
  });
  console.log("✅ Security check complete");
});
```

Expected: No security warnings

---

## Troubleshooting Verification

### 20. Common Issues Resolved ✓

Run through troubleshooting.md common scenarios:

- [ ] Can unregister service worker
- [ ] Can clear all caches
- [ ] Can force update
- [ ] Can recover from cache corruption

```bash
# Nuclear reset test:
# 1. DevTools → Application → Clear storage → Clear site data
# 2. Reload page
# 3. Verify: App works and service worker re-registers
```

---

## Final Checklist

Run all checks and mark complete:

### Build

- [ ] `npm run build` succeeds without errors
- [ ] Service worker files generated in dist/
- [ ] Manifest file generated

### Registration

- [ ] Service worker registers in dev mode
- [ ] Service worker registers in production
- [ ] Service worker activates successfully

### Caching

- [ ] All expected caches created
- [ ] Static assets cached correctly
- [ ] API responses cached with Network-first
- [ ] Auth endpoints NOT cached (security)

### Offline

- [ ] App loads offline from cache
- [ ] Offline indicator shows when offline
- [ ] Offline fallback page works
- [ ] Navigation works offline

### Updates

- [ ] Update prompt appears on new version
- [ ] "Reload Now" triggers update
- [ ] Dismiss button hides prompt

### Background Sync

- [ ] At least 3 of 5 strategies work (browser-dependent)
- [ ] Visibility change works (all browsers)
- [ ] Online event works (all browsers)
- [ ] Periodic timer works (check after 5min)

### Cross-Browser

- [ ] Works in Chrome/Edge
- [ ] Works in Firefox
- [ ] Works in Safari (desktop and iOS)

### Security

- [ ] HTTPS enforced (production)
- [ ] No sensitive data cached
- [ ] Cache size under limits

---

## Success Criteria

**Minimum passing grade (must have ALL):**

✅ Service worker registers and activates
✅ Offline mode works (app loads without internet)
✅ Caching strategies correctly implemented
✅ Auth endpoints NOT cached
✅ At least 2 background sync strategies work
✅ Works on iOS Safari (critical for this project)

**Excellent implementation (bonus):**

✅ All 5 background sync strategies configured
✅ Update prompt works smoothly
✅ Cache size optimized (<50MB)
✅ Load performance <0.5s cached
✅ No console errors or warnings

---

## Next Steps

Once all verifications pass:

1. ✅ Mark chunk 042 complete in progress tracker
2. ➡️ Proceed to **Chunk 043: Push Notifications**
3. 📚 Reference this verification if service worker issues arise later

---

**Verification completed by**: ********\_********
**Date**: ********\_********
**Browser tested**: Chrome ☐ Firefox ☐ Safari ☐ iOS Safari ☐
**All checks passed**: YES ☐ NO ☐
**Notes**:
