# Troubleshooting: Service Worker

Common issues and solutions when working with service workers.

---

## Registration Issues

### Problem: Service worker won't register

**Symptoms**: "Service worker registration failed"

**Causes & Solutions**:

1. **Not HTTPS**: Only works on HTTPS or localhost

   ```bash
   # Development: use localhost
   npm run dev

   # Or use ngrok for HTTPS
   ngrok http 3000
   ```

2. **Scope issues**: SW must be in root
   - SW file MUST be at `/sw.js` or `/registerSW.js`
   - NOT in `/assets/sw.js`

3. **CORS errors**: Check headers
   ```typescript
   // vite.config.ts - add headers if needed
   server: {
     headers: {
       'Service-Worker-Allowed': '/',
     },
   }
   ```

---

## Caching Issues

### Problem: Assets not caching

**Symptoms**: Network tab shows all requests from network, never from SW

**Solutions**:

1. **Verify SW active**:

   ```javascript
   navigator.serviceWorker.controller !== null;
   ```

2. **Check cache patterns**:

   ```typescript
   // Must match your files
   globPatterns: ["**/*.{js,css,html}"];
   ```

3. **Clear and retry**:
   - DevTools → Application → Clear storage
   - Unregister SW
   - Reload

---

### Problem: Stale cache won't update

**Symptoms**: Old version loads even after rebuild

**Solutions**:

1. **Check SW update**:
   - DevTools → Application → Service Workers
   - Click "Update" button

2. **Enable update on reload**:
   - Check "Update on reload" in DevTools

3. **Skip waiting**:
   ```typescript
   // In vite.config.ts
   VitePWA({
     registerType: "autoUpdate", // Auto-activates new SW
   });
   ```

---

## Offline Issues

### Problem: App doesn't work offline

**Symptoms**: White screen or "No Internet" when offline

**Solutions**:

1. **Verify caching**:
   - Check Cache Storage has files
   - Verify HTML cached

2. **Check navigate fallback**:

   ```typescript
   workbox: {
     navigateFallback: '/offline.html',
   }
   ```

3. **iOS Safari**: Use visibility fallback
   ```typescript
   // Sync on app focus
   document.addEventListener("visibilitychange", syncHandler);
   ```

---

### Problem: API calls fail offline

**Symptoms**: Network errors, no cached data

**Solutions**:

1. **Add runtime caching**:

   ```typescript
   runtimeCaching: [
     {
       urlPattern: /\/api\/.*/,
       handler: "NetworkFirst",
       options: {
         cacheName: "api-cache",
       },
     },
   ];
   ```

2. **Check response cacheability**:
   ```typescript
   cacheableResponse: {
     statuses: [0, 200],  // Cache successful responses
   }
   ```

---

## Update Issues

### Problem: Update prompt never shows

**Symptoms**: New version deployed but no prompt

**Solutions**:

1. **Check registerType**:

   ```typescript
   VitePWA({
     registerType: "prompt", // Not 'autoUpdate'
   });
   ```

2. **Verify registration hook**:

   ```typescript
   useRegisterSW({
     onNeedRefresh() {
       // This should fire
       console.log("Update available");
     },
   });
   ```

3. **Force check**:
   ```javascript
   // Manually check for updates
   navigator.serviceWorker.getRegistration().then((reg) => {
     reg?.update();
   });
   ```

---

### Problem: Update prompt shows on every reload

**Symptoms**: Annoying repeated prompts

**Solution**: Track dismissal

```typescript
const [dismissed, setDismissed] = useState(
  () => sessionStorage.getItem("sw-update-dismissed") === "true"
);

const dismiss = () => {
  sessionStorage.setItem("sw-update-dismissed", "true");
  setDismissed(true);
};
```

---

## iOS Safari Issues

### Problem: Background sync doesn't work on iOS

**Symptoms**: Offline changes don't sync on reconnect

**Solution**: Use fallback strategy

```typescript
// Sync on visibility change
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && navigator.onLine) {
    syncQueue();
  }
});

// Sync on online event
window.addEventListener("online", syncQueue);
```

---

### Problem: iOS shows old cached version

**Symptoms**: Updates don't apply on iOS

**Solution**: Clear iOS cache

1. Settings → Safari → Clear History and Website Data
2. Or: Add version to app
   ```typescript
   // Show version in footer
   const SW_VERSION = "__SW_VERSION__"; // Injected by build
   ```

---

## Performance Issues

### Problem: Slow initial load after SW install

**Symptoms**: First load takes 5-10s

**Cause**: Large precache

**Solutions**:

1. **Reduce precache size**:

   ```typescript
   globPatterns: [
     "**/*.{js,css,html}", // Essential only
     // Don't precache images
   ];
   ```

2. **Use runtime caching for images**:
   ```typescript
   runtimeCaching: [
     {
       urlPattern: /\.(?:png|jpg|jpeg|svg)$/,
       handler: "CacheFirst",
     },
   ];
   ```

---

### Problem: Cache using too much storage

**Symptoms**: "QuotaExceededError"

**Solutions**:

1. **Set cache limits**:

   ```typescript
   expiration: {
     maxEntries: 50,
     maxAgeSeconds: 60 * 60 * 24 * 7,  // 7 days
   }
   ```

2. **Monitor quota**:
   ```typescript
   navigator.storage.estimate().then(({ usage, quota }) => {
     console.log(`Using ${usage} of ${quota} bytes`);
   });
   ```

---

## Debugging Tools

### Check SW status

```javascript
navigator.serviceWorker.getRegistrations().then((regs) => {
  regs.forEach((reg) => {
    console.log({
      scope: reg.scope,
      active: !!reg.active,
      waiting: !!reg.waiting,
      installing: !!reg.installing,
    });
  });
});
```

### View all caches

```javascript
caches.keys().then((names) => {
  console.log("Caches:", names);
  names.forEach((name) => {
    caches.open(name).then((cache) => {
      cache.keys().then((keys) => {
        console.log(`${name}:`, keys.length, "entries");
      });
    });
  });
});
```

### Force SW update

```javascript
navigator.serviceWorker.getRegistration().then((reg) => {
  reg?.unregister();
  location.reload();
});
```

---

## Prevention Tips

1. **Test offline early**: Don't wait until deployment
2. **Monitor cache size**: Set reasonable limits
3. **Version service worker**: For debugging
4. **Clear cache on major updates**: Prevent stale data
5. **Test on iOS**: Different behavior than Chrome

---

## Quick Fixes

```bash
# Nuclear option - clear everything
# DevTools → Application → Clear storage → Clear site data

# Unregister all SWs
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(reg => reg.unregister());
});

# Clear all caches
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});

# Rebuild
rm -rf dist .vite
npm run build
npm run preview
```

---

**Remember**: Service workers are powerful but complex. Test thoroughly and provide good error messages to users.
