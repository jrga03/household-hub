# Checkpoint: Service Worker

Run these verifications to ensure everything works correctly.

---

## 1. Build Success ✓

```bash
npm run build
```

**Expected**:

- No errors
- `dist/sw.js` or `dist/registerSW.js` created
- Cache manifest generated

---

## 2. Service Worker Registers ✓

Open DevTools → Application → Service Workers

**Check**:

- [ ] Status: Activated and running (green dot)
- [ ] Scope: "/"
- [ ] Source: `/sw.js`
- [ ] Update on reload enabled

---

## 3. Caches Created ✓

DevTools → Application → Cache Storage

**Expected caches**:

- [ ] `workbox-precache-v2-<hash>` (static assets)
- [ ] `supabase-api-cache` (API responses)
- [ ] `supabase-storage-cache` (images)
- [ ] `google-fonts-cache` (fonts)

**Verify cached files**:

- Expand `workbox-precache`
- Should contain: JS bundles, CSS, HTML, icons

---

## 4. Offline Mode Works ✓

**Test**:

1. Load app normally
2. DevTools → Network → Throttling → Offline
3. Refresh page
4. Navigate to different routes

**Expected**:

- [ ] App loads from cache
- [ ] Navigation works
- [ ] Offline indicator shows
- [ ] Cached data displays

---

## 5. Offline Fallback Works ✓

**Test**:

1. Clear all caches
2. Go offline (DevTools)
3. Try to navigate to new route not in cache
4. **Expected**: `/offline.html` displays

**Verify**:

- [ ] "You're Offline" message shows
- [ ] Styled nicely with gradient background
- [ ] "Return to App" button visible

---

## 6. Update Prompt Appears ✓

**Test**:

1. Build app: `npm run build && npm run preview`
2. Open app in browser
3. Make code change (edit any file)
4. Rebuild: `npm run build`
5. Refresh browser (or wait ~60s)

**Expected**:

- [ ] Update prompt appears bottom-right
- [ ] Shows "Update Available" message
- [ ] Has "Reload Now" button
- [ ] Has dismiss (X) button

**Test actions**:

- Click "Reload Now" → app reloads
- Click X → prompt disappears

---

## 7. Offline Indicator Shows ✓

**Test**:

1. DevTools → Network → Offline
2. **Expected**: Yellow banner at top
3. Shows "You're offline" message with wifi icon
4. Go online
5. **Expected**: Banner disappears

---

## 8. Caching Strategies Work ✓

### Cache First (Static Assets)

```bash
# In DevTools Network tab with cache enabled:
# 1. Load page - assets from network (200)
# 2. Reload - assets from service worker (200, from ServiceWorker)
```

### Network First (API)

```bash
# 1. Make API call - from network
# 2. Go offline
# 3. Same API call - from cache
```

---

## 9. Background Sync Fallback (iOS) ✓

**Test** (if on iOS or simulating):

```typescript
// In console:
registerBackgroundSync(async () => {
  console.log("Sync triggered!");
});

// Switch to another app
// Come back
// Expected: "Sync triggered!" in console
```

---

## 10. Service Worker Lifecycle ✓

**Test update flow**:

1. Old SW active
2. New SW installs in background
3. New SW waits
4. User sees update prompt
5. User clicks "Reload"
6. New SW activates
7. Page reloads with new version

**Verify in DevTools**:

- Application → Service Workers
- Watch "waiting" → "activated" transition

---

## Success Criteria

- [ ] Service worker registers successfully
- [ ] Multiple caches created with appropriate names
- [ ] App loads offline from cache
- [ ] Offline fallback page displays when needed
- [ ] Update prompt appears on new version
- [ ] Offline indicator shows/hides correctly
- [ ] Caching strategies work as configured
- [ ] iOS fallback sync registered

---

## Common Issues

### Issue: Service worker not registering

**Check**:

```javascript
navigator.serviceWorker.getRegistrations().then((regs) => {
  console.log("Registered:", regs.length);
});
```

**Solution**: Verify HTTPS or localhost

### Issue: Cache not updating

**Solution**:

```javascript
// Unregister and clear
navigator.serviceWorker.getRegistrations().then((regs) => {
  regs.forEach((reg) => reg.unregister());
});
```

Then reload.

---

## Next Steps

Once all checks pass:

1. **Run comprehensive verification**: See `verification.md` for detailed cross-browser and security tests
2. **Test on mobile devices**: Especially iOS Safari (critical for this project)
3. **Verify storage quota**: If you implemented Step 8, check cache size is reasonable
4. **Commit service worker code**: Service worker implementation complete
5. **Move to Chunk 043**: Push Notifications (requires service worker)
