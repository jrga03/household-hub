# Chunk 042: Service Worker

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Production (2 of 6)
- **Prerequisites**: Chunk 041 (PWA manifest configured)
- **Can Skip**: No - essential for offline functionality

## What You're Building

Production-ready service worker with intelligent caching:

- Vite PWA plugin with Workbox integration
- Cache-first strategy for static assets
- Network-first strategy for API calls
- Offline fallback page
- Background sync for failed requests
- Periodic background sync
- Cache versioning and cleanup
- Update notifications

## Why This Matters

Service workers are **the core of offline PWAs**:

- **Offline access**: App works without internet
- **Performance**: Instant load from cache
- **Reliability**: No "no connection" errors
- **Background sync**: Queue changes when offline
- **Push notifications**: Enable alert delivery (chunk 043)
- **App-like feel**: Native app responsiveness

Per Day 13 implementation plan, this completes the offline experience.

## Before You Start

Make sure you have:

- **Chunk 041 completed** (PWA manifest working)
- **Vite PWA plugin installed** (`vite-plugin-pwa` in package.json)
- **App builds successfully** (`npm run build` completes without errors)
- **Dexie/IndexedDB setup complete** (from chunks 021-022)
  - Sync queue table exists in Dexie schema
  - Device ID system initialized
  - Meta table for device registration
- **Basic understanding of caching strategies**
  - Cache-first vs Network-first patterns
  - When to cache vs when not to
- **Test scenarios prepared**
  - Mobile device or browser DevTools for offline testing
  - Network throttling tools available

## What Happens Next

After this chunk:

- Static assets cached for offline access
- API responses cached with network fallback
- Failed requests queue for retry
- Update prompts when new version available
- Ready for push notifications (chunk 043)

## Key Files Created

```
src/
├── sw.ts                      # Custom service worker logic (optional)
├── components/
│   └── UpdatePrompt.tsx       # New version notification
└── hooks/
    └── useServiceWorker.ts    # SW registration hook
vite.config.ts                 # Enhanced Workbox config
public/
└── offline.html               # Offline fallback page
```

## Features Included

### Caching Strategies

- **Cache First**: Static assets (JS, CSS, images)
- **Network First**: API calls with cache fallback
- **Stale While Revalidate**: Fonts, external resources
- **Network Only**: Authentication, sensitive data

### Offline Support

- Queue failed POST/PUT/DELETE requests
- Show cached data when offline
- Sync queued requests when back online
- Offline fallback page for navigation

### Update Management

- Detect new service worker versions
- Show update prompt to user
- Reload to activate new version
- Skip waiting on user confirmation

### Background Sync

- Queue offline mutations
- Retry with exponential backoff
- Persist failed requests
- Trigger sync on connection restore

### Cache Management

- Automatic cache versioning
- LRU (Least Recently Used) eviction
- Size-based limits (50MB default)
- Periodic cleanup

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 474-488 (Day 13 service worker)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` (background sync patterns)
- **External**: [Workbox Docs](https://developers.google.com/web/tools/workbox)
- **External**: [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

## Technical Stack

- **Vite PWA Plugin**: Service worker generation
- **Workbox**: Caching and routing library
- **Background Sync API**: Offline request queuing
- **Periodic Background Sync**: Scheduled updates (Chrome only)
- **Cache Storage API**: Asset caching

## Design Patterns

### Cache-First Pattern (Static Assets)

```
Request → Cache → (if hit) Return
                → (if miss) Network → Cache → Return
```

### Network-First Pattern (API)

```
Request → Network → (if success) Cache → Return
                  → (if fail) Cache → Return
```

### Stale-While-Revalidate Pattern

```
Request → Cache → Return immediately
       → Network → Update cache in background
```

## Caching Strategy Decision Tree

```
Is it static (JS/CSS/images)?
  → Yes: Cache First (instant load)
  → No: Continue

Is it API data?
  → Yes: Network First (fresh data, offline fallback)
  → No: Continue

Is it authentication?
  → Yes: Network Only (never cache sensitive data)
  → No: Stale While Revalidate
```

## Cache Size Guidelines

**Storage Quota** (Chrome):

- **Mobile**: ~70% of available disk space
- **Desktop**: ~70% of available disk space
- **Warning at**: 80% quota
- **Error at**: 100% quota

**Recommended Limits**:

- **Static assets**: 50MB (adjustable)
- **API cache**: 25MB
- **Images**: 100MB
- **Total**: ~200MB typical

## iOS Safari Limitations

### Not Supported

- ❌ Background Sync API
- ❌ Periodic Background Sync
- ❌ Push notifications (< iOS 16.4)

### Fallbacks

- Use `visibilitychange` event for sync on app focus
- Manual sync button
- Store queue in IndexedDB, sync on navigation

## Browser Compatibility

| Feature         | Chrome | Firefox | Safari   | Edge   |
| --------------- | ------ | ------- | -------- | ------ |
| Service Workers | ✅ 40+ | ✅ 44+  | ✅ 11.1+ | ✅ 17+ |
| Background Sync | ✅ 49+ | ❌      | ❌       | ✅ 79+ |
| Periodic Sync   | ✅ 80+ | ❌      | ❌       | ✅ 80+ |
| Cache API       | ✅ 40+ | ✅ 44+  | ✅ 11.1+ | ✅ 17+ |

## Performance Characteristics

### Initial Load (No Cache)

- **Without SW**: 2s
- **With SW**: 2s (first visit, same)

### Subsequent Loads (Cached)

- **Without SW**: 1.5s (browser cache)
- **With SW**: 0.5s (instant from cache)

### Update Detection

- **Check interval**: On navigation
- **Download new SW**: Background (~500ms)
- **Activate**: On user confirmation

## Security Considerations

### HTTPS Required

Service workers ONLY work on:

- HTTPS sites (production)
- `localhost` (development)

### Sensitive Data

NEVER cache:

- Authentication tokens (use memory/httpOnly cookies)
- Personal financial details (transaction descriptions)
- Credit card numbers
- Passwords

### Cache Poisoning Prevention

- Validate responses before caching
- Check `response.ok` (status 200-299)
- Verify content-type headers
- Use cache versioning to bust compromised cache

## Testing Strategy

### Manual Tests

1. **Offline mode**: Toggle offline, verify app loads
2. **Cache verification**: Check Application tab → Cache Storage
3. **Update flow**: Build new version, verify update prompt
4. **Background sync**: Go offline, make change, go online, verify sync

### Automated Tests

```typescript
// Playwright test
test("app works offline", async ({ page, context }) => {
  // Visit and let SW cache assets
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Go offline
  await context.setOffline(true);

  // Navigate
  await page.goto("/transactions");

  // Should load from cache
  await expect(page.getByText("Transactions")).toBeVisible();
});
```

---

**Ready?** → Open `instructions.md` to begin
