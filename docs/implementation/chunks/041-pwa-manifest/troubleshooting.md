# Troubleshooting: PWA Manifest

Common issues and solutions when working with PWA manifest and install prompts.

---

## Vite PWA Plugin Issues

### Problem: "Cannot find module 'vite-plugin-pwa'"

**Symptoms**:

```
Error: Cannot find module 'vite-plugin-pwa'
```

**Cause**: Package not installed

**Solution**:

```bash
npm install -D vite-plugin-pwa
```

Verify in `package.json`:

```json
{
  "devDependencies": {
    "vite-plugin-pwa": "^0.17.0"
  }
}
```

---

### Problem: Build fails with "workbox" errors

**Symptoms**:

```
Error: Workbox config invalid
```

**Cause**: Invalid Workbox configuration

**Solution**:
Simplify Workbox config in `vite.config.ts`:

```typescript
workbox: {
  globPatterns: ['**/*.{js,css,html}'],
  // Remove complex runtime caching during setup
}
```

Add caching strategies later after basic PWA works.

---

## Manifest Issues

### Problem: Manifest not loading (404 error)

**Symptoms**:

- DevTools shows "Failed to load manifest"
- Console: `GET /manifest.webmanifest 404`

**Cause**: Manifest not generated or wrong path

**Solution**:

**Check 1**: Verify Vite PWA plugin installed

```bash
npm list vite-plugin-pwa
```

**Check 2**: Build project

```bash
npm run build
ls dist/manifest.webmanifest  # Should exist
```

**Check 3**: Verify link tag in `index.html`

```html
<link rel="manifest" href="/manifest.webmanifest" />
<!-- NOT /public/manifest.webmanifest -->
```

---

### Problem: "Manifest start_url is not in scope"

**Symptoms**:
DevTools → Application → Manifest shows warning

**Cause**: `start_url` is outside `scope`

**Solution**:
Update manifest config:

```typescript
manifest: {
  scope: '/',
  start_url: '/',  // Must be within scope
}
```

---

### Problem: "Manifest does not have a maskable icon"

**Symptoms**:
Warning in DevTools or install prompt doesn't show

**Cause**: Missing maskable icon purpose

**Solution**:
Update icon config:

```typescript
icons: [
  {
    src: "/icons/icon-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any maskable", // Add 'maskable'
  },
];
```

For true maskable icons, ensure 80% safe zone (icon content in center 80%).

---

## Service Worker Issues

### Problem: Service worker not registering

**Symptoms**:

- DevTools → Application → Service Workers shows "No service workers registered"
- Install prompt never appears

**Cause**: Service worker registration failing

**Solution**:

**Check 1**: HTTPS enabled (or localhost)

```bash
# Development - use localhost
npm run dev

# Production - verify HTTPS
curl -I https://yourdomain.com
```

**Check 2**: Check console for errors

```javascript
// Look for service worker registration errors
navigator.serviceWorker.getRegistrations().then((registrations) => {
  console.log("Registered:", registrations.length);
});
```

**Check 3**: Clear site data and retry

1. DevTools → Application → Clear storage
2. Click "Clear site data"
3. Reload page

---

### Problem: "Service worker registration failed"

**Symptoms**:

```
TypeError: Failed to register a ServiceWorker
```

**Cause**: Service worker file not found or JavaScript error

**Solution**:

Check service worker exists:

```bash
ls dist/sw.js
# or
ls dist/registerSW.js
```

If missing, check Vite config:

```typescript
VitePWA({
  registerType: "autoUpdate",
  // This generates the service worker
});
```

---

## Install Prompt Issues

### Problem: Install prompt never appears

**Symptoms**:

- `beforeinstallprompt` event never fires
- Install button never shows

**Cause**: Not meeting install criteria

**Chrome Install Criteria**:

1. ✅ HTTPS (or localhost)
2. ✅ Valid manifest with required fields
3. ✅ Service worker registered
4. ✅ User engagement (30s dwell time OR visit 2+ pages)

**Solution**:

**Check 1**: Verify all criteria met

```bash
# Open DevTools → Application → Manifest
# Look for "Installability" section
# It will list missing requirements
```

**Check 2**: Increase engagement

```typescript
// Force engagement (dev only)
setTimeout(() => {
  window.dispatchEvent(new Event("beforeinstallprompt"));
}, 5000);
```

**Check 3**: Test manually
DevTools → Application → Manifest → "Add to home screen" button

---

### Problem: "beforeinstallprompt" fires but prompt doesn't show

**Symptoms**:

- Event fires in console
- `e.prompt()` does nothing

**Cause**: Must call `e.preventDefault()` before storing event

**Solution**:
Fix event handler:

```typescript
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // MUST call this first
  setDeferredPrompt(e);
});
```

---

### Problem: Install prompt shows then disappears immediately

**Symptoms**:

- Install button flashes briefly
- Then disappears

**Cause**: Re-render unmounts component before user can click

**Solution**:
Use proper state management:

```typescript
const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

// Store event immediately, don't wait
useEffect(() => {
  const handler = (e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e as BeforeInstallPromptEvent);
  };

  window.addEventListener("beforeinstallprompt", handler);

  return () => window.removeEventListener("beforeinstallprompt", handler);
}, []); // Empty deps - run once only
```

---

## Icon Issues

### Problem: Icons not displaying in manifest

**Symptoms**:
DevTools → Application → Manifest shows broken icon images

**Cause**: Incorrect icon paths or files don't exist

**Solution**:

**Check 1**: Verify files exist

```bash
ls -la public/icons/
# Should show all icon files
```

**Check 2**: Check paths in manifest

```typescript
// Paths should NOT include /public/
icons: [
  {
    src: "/icons/icon-192x192.png", // Correct
    // NOT: '/public/icons/icon-192x192.png'
  },
];
```

**Check 3**: Verify files copied to dist

```bash
npm run build
ls dist/icons/  # Icons should be here
```

---

### Problem: iOS doesn't show custom icon

**Symptoms**:

- Android shows custom icon
- iOS shows generic Safari icon

**Cause**: Missing apple-touch-icon

**Solution**:
Add to `index.html`:

```html
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

Ensure file exists:

```bash
# Should be 180x180 PNG
ls -lh public/icons/apple-touch-icon.png
```

---

### Problem: Android shows icon with white background (ugly)

**Symptoms**:
Icon looks bad on colored home screen backgrounds

**Cause**: Icon not using transparency or not maskable

**Solution**:

**Option 1**: Use transparent PNG

- Remove white background from icon
- Save as PNG with transparency

**Option 2**: Use maskable icon

```typescript
icons: [
  {
    src: "/icons/icon-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any", // Regular icon
  },
  {
    src: "/icons/icon-maskable-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable", // Separate maskable icon
  },
];
```

Maskable icon guidelines:

- Content in center 80% (safe zone)
- Outer 20% may be cut by mask
- Test at: https://maskable.app/

---

### Problem: Shortcut icons not displaying

**Symptoms**:

- App shortcuts appear in context menu
- But show broken/missing icons
- Console error: 404 for `/icons/shortcut-*.png`

**Cause**: Forgot to generate shortcut icon files

**Solution**:

Generate the shortcut icons:

```bash
# Navigate to project root
cd /path/to/project

# Generate shortcut icons (96x96)
npx sharp -i logo.png -o public/icons/shortcut-add.png resize 96 96
npx sharp -i logo.png -o public/icons/shortcut-dashboard.png resize 96 96
```

Or manually create 96x96 PNG files:

1. Open logo in image editor
2. Resize to 96x96 pixels
3. Save as `shortcut-add.png` and `shortcut-dashboard.png`
4. Place in `public/icons/`

Verify files exist:

```bash
ls -la public/icons/shortcut-*.png
```

Rebuild and test:

```bash
npm run build
npm run preview
# Right-click installed app icon to see shortcuts
```

---

## iOS-Specific Issues

### Problem: iOS app doesn't go fullscreen

**Symptoms**:

- App launches in Safari browser
- Safari UI visible

**Cause**: Missing or incorrect meta tags

**Solution**:
Add to `index.html`:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

Verify after adding to home screen:

```javascript
// Should be true in standalone mode
console.log(window.navigator.standalone);
```

---

### Problem: iOS status bar wrong color

**Symptoms**:
Status bar is black instead of theme color

**Cause**: Incorrect status bar style

**Solution**:
Try different styles:

```html
<!-- Option 1: Match content -->
<meta name="apple-mobile-web-app-status-bar-style" content="default" />

<!-- Option 2: Black -->
<meta name="apple-mobile-web-app-status-bar-style" content="black" />

<!-- Option 3: Translucent (iOS 7+) -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

Also set theme color:

```html
<meta name="theme-color" content="#ffffff" />
```

---

### Problem: iOS install instructions don't show

**Symptoms**:

- Install button doesn't work on iOS
- No dialog appears

**Cause**: iOS doesn't support `beforeinstallprompt` event

**Solution**:
Detect iOS and show custom instructions:

```typescript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

if (isIOS && !window.navigator.standalone) {
  // Show custom install instructions
  showIOSInstructions();
}
```

---

## TypeScript Issues

### Problem: "Property 'prompt' does not exist on Event"

**Symptoms**:

```typescript
// TypeScript error on:
deferredPrompt.prompt();
```

**Cause**: BeforeInstallPromptEvent not typed

**Solution**:
Add interface:

```typescript
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Then use:
const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
```

---

### Problem: "window.navigator.standalone does not exist"

**Symptoms**:
TypeScript error when checking iOS standalone mode

**Cause**: TypeScript doesn't know about iOS-specific property

**Solution**:
Extend Navigator interface:

```typescript
// In types/global.d.ts
interface Navigator {
  standalone?: boolean;
}

// Then use:
if (window.navigator.standalone) {
  // Running in iOS standalone mode
}
```

---

## Testing Issues

### Problem: Can't test install prompt in development

**Symptoms**:

- `beforeinstallprompt` never fires in dev mode
- Can't test install flow

**Cause**: Dev server not meeting install criteria

**Solution**:

**Option 1**: Build and preview

```bash
npm run build
npm run preview
# Visit http://localhost:4173
```

**Option 2**: Use ngrok for HTTPS

```bash
npm install -g ngrok
npm run dev
ngrok http 3000

# Visit HTTPS ngrok URL
```

**Option 3**: Force event (dev only)

```typescript
// Add button to manually trigger
<button onClick={() => {
  const event = new Event('beforeinstallprompt');
  window.dispatchEvent(event);
}}>
  Test Install Prompt
</button>
```

---

### Problem: Install prompt appears every page load (annoying)

**Symptoms**:

- Install button shows even after dismissing
- No way to permanently dismiss

**Cause**: Not tracking user preference

**Solution**:
Track dismissals:

```typescript
const [dismissed, setDismissed] = useState(() => {
  return localStorage.getItem('install-prompt-dismissed') === 'true';
});

const handleDismiss = () => {
  localStorage.setItem('install-prompt-dismissed', 'true');
  setDismissed(true);
};

// Only show if not dismissed and installable
if (!dismissed && isInstallable) {
  return <InstallButton onDismiss={handleDismiss} />;
}
```

---

## Performance Issues

### Problem: Large bundle size increase after adding PWA

**Symptoms**:

- Bundle size increased by 50KB+
- Slow initial load

**Cause**: Service worker runtime and Workbox included

**Solution**:

**Check 1**: Analyze bundle

```bash
npm run build -- --mode analyze
```

**Check 2**: Reduce service worker scope

```typescript
workbox: {
  globPatterns: ['**/*.{js,css,html}'],  // Only essential files
  // Don't cache everything!
}
```

**Check 3**: Use CDN for Workbox

```typescript
VitePWA({
  workbox: {
    mode: "production",
  },
});
```

Typical PWA overhead: 10-15KB gzipped (acceptable)

---

## Debugging Tips

### View Service Worker Status

```javascript
// In console
navigator.serviceWorker.getRegistrations().then((regs) => {
  regs.forEach((reg) => {
    console.log("Scope:", reg.scope);
    console.log("Active:", reg.active);
    console.log("Installing:", reg.installing);
    console.log("Waiting:", reg.waiting);
  });
});
```

### Check Install Eligibility

```javascript
// Chrome only
console.log("Is Installed:", window.matchMedia("(display-mode: standalone)").matches);
console.log("Is Secure:", window.isSecureContext);
console.log("Has SW:", "serviceWorker" in navigator);
```

### Force Update Service Worker

```javascript
// Update service worker
navigator.serviceWorker.getRegistrations().then((regs) => {
  regs.forEach((reg) => reg.update());
});

// Or unregister and reload
navigator.serviceWorker.getRegistrations().then((regs) => {
  regs.forEach((reg) => reg.unregister());
  location.reload();
});
```

---

## Prevention Tips

1. **Test early**: Test install flow early and often
2. **Use HTTPS**: Always test on HTTPS (use ngrok if needed)
3. **Validate manifest**: Use online validators
4. **Check DevTools**: Application tab shows all PWA info
5. **Test on real devices**: Desktop, Android, iOS
6. **Track dismissals**: Don't spam install prompt

---

## Quick Fixes

```bash
# Clear everything and start fresh
# 1. Clear site data
# DevTools → Application → Clear storage

# 2. Unregister service workers
# DevTools → Application → Service Workers → Unregister

# 3. Clear cache
rm -rf dist .vite node_modules/.vite

# 4. Rebuild
npm install
npm run build
npm run preview
```

---

## Getting Help

If stuck:

1. Check Chrome DevTools → Application → Manifest → Installability section
2. Review console for errors
3. Verify all files in checklist exist
4. Test on different browser/device
5. Check Vite PWA plugin docs: https://vite-pwa-org.netlify.app/

---

**Remember**: PWA features are progressive. If install prompt doesn't work, app still functions normally as a web app.
