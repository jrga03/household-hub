# Chunk 041: PWA Manifest

## At a Glance

- **Time**: 1 hour
- **Milestone**: Production (1 of 6)
- **Prerequisites**: Chunks 001-040 complete (working app deployed to staging)
- **Can Skip**: No - required for PWA installation

## What You're Building

Progressive Web App manifest configuration:

- PWA manifest.json with complete metadata
- App icons (16x16 to 512x512)
- Splash screens for iOS
- Install prompt UI component
- Theme colors and display modes
- App categories and descriptions
- Shortcuts for quick actions

## Why This Matters

PWA manifest is **essential for app installation**:

- **Native feel**: App installs like native mobile app
- **Home screen**: Users can add to home screen
- **Standalone mode**: Runs without browser UI
- **Branding**: Custom icon, colors, name
- **Discovery**: Listed in app stores (future)
- **User retention**: Installed apps have 3x higher retention

Per Day 13 of implementation plan, this enables mobile-first deployment.

## Before You Start

Make sure you have:

- Working app deployed to staging (or localhost)
- Vite project configured
- App logo/icon in SVG or PNG
- Basic understanding of PWA concepts
- Test device for install testing (mobile or desktop)

## What Happens Next

After this chunk:

- PWA manifest fully configured
- Install prompt appears on supported browsers
- App can be installed to home screen
- Custom app icon displays
- Ready for service worker setup (chunk 042)

## Key Files Created

```
public/
├── manifest.json              # PWA manifest
├── icons/
│   ├── icon-16x16.png
│   ├── icon-32x32.png
│   ├── icon-192x192.png       # Android
│   ├── icon-512x512.png       # Android splash
│   └── apple-touch-icon.png   # iOS (180x180)
├── splash/
│   ├── apple-splash-2048-2732.jpg    # iPad Pro 12.9"
│   ├── apple-splash-1668-2388.jpg    # iPad Pro 11"
│   └── ... (other iOS splash screens)
src/
├── components/
│   └── InstallPrompt.tsx      # Install button UI
└── hooks/
    └── useInstallPrompt.ts    # PWA install hook
vite.config.ts                 # Updated with PWA plugin
```

## Features Included

### Manifest Configuration

- App name and short name
- Description and categories
- Theme and background colors
- Display mode (standalone, minimal-ui)
- Start URL and scope
- Orientation preferences

### Icons

- Multiple sizes for different platforms
- Maskable icons for Android adaptive icons
- Apple touch icons for iOS
- Favicon sizes for browsers
- Purpose flags (any, maskable, monochrome)

### Install Prompt

- Custom install button
- beforeinstallprompt event handling
- iOS-specific install instructions
- Install success feedback
- Dismissal tracking (don't show again)

### iOS Support

- Apple-specific meta tags
- Apple touch icon
- Apple splash screens (multiple sizes)
- Status bar styling
- Standalone detection

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 447-488 (Day 13 PWA setup)
- **External**: [PWA Manifest Spec](https://web.dev/articles/add-manifest)
- **External**: [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- **External**: [iOS PWA Guide](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)

## Technical Stack

- **Vite PWA Plugin**: `vite-plugin-pwa`
- **Workbox**: Service worker library (auto-configured)
- **React**: Install prompt component
- **Sharp**: Icon generation (optional)

## Design Patterns

### Progressive Enhancement Pattern

```typescript
// Feature detection, graceful fallback
if ("serviceWorker" in navigator) {
  // PWA features available
} else {
  // Regular web app experience
}
```

### Install Prompt Pattern

```typescript
// Capture install event
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  setDeferredPrompt(e);
  setShowInstallPrompt(true);
});

// Trigger install on button click
const handleInstall = async () => {
  deferredPrompt?.prompt();
  const result = await deferredPrompt?.userChoice;
  if (result?.outcome === "accepted") {
    // Track successful install
  }
};
```

### iOS Detection Pattern

```typescript
// iOS doesn't support beforeinstallprompt
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

if (isIOS && !isStandalone) {
  // Show iOS-specific install instructions
}
```

## Platform Support

### Install Prompt Support

- ✅ Chrome 68+ (Android)
- ✅ Edge 79+
- ✅ Samsung Internet 8+
- ⚠️ iOS Safari 16.4+ (limited, no prompt event)
- ❌ Firefox (no install prompt yet)

### PWA Features Support

- ✅ Chrome/Edge: Full support
- ✅ Safari 11.1+: Full support (iOS 16.4+ for notifications)
- ⚠️ Firefox: Service workers yes, install prompt no
- ✅ Samsung Internet: Full support

## Icon Sizes Required

### Android

- 192x192 (launcher icon)
- 512x512 (splash screen)
- Maskable icon (safe zone 80%)

### iOS

- 180x180 (apple-touch-icon)
- Multiple splash screens (varies by device)

### Desktop

- 16x16, 32x32 (favicon)
- 72x72, 96x96, 128x128, 192x192 (Windows tiles)

## App Categories

Choose from PWA standard categories:

- `finance` (primary for Household Hub)
- `productivity` (secondary)
- `lifestyle` (tertiary)

## Performance Considerations

- **Icon optimization**: Use WebP for splash screens (fallback to JPEG)
- **Manifest caching**: Cache manifest.json aggressively
- **Lazy load**: Don't block app for install prompt
- **Bundle size**: Vite PWA adds ~10KB gzipped

## Accessibility

- **Install instructions**: Screen reader friendly
- **Focus management**: Trap focus in install modal
- **Keyboard navigation**: ESC to close, Enter to install
- **ARIA labels**: Describe install action clearly

## Testing Strategy

### Desktop

1. Chrome DevTools → Application → Manifest
2. Verify all fields populate correctly
3. Check icon display in various sizes
4. Test install prompt appears
5. Install app and verify home screen icon

### Mobile (Android)

1. Visit app on Chrome mobile
2. Install prompt should appear after engagement
3. Tap "Add to Home Screen"
4. Launch installed app
5. Verify standalone mode (no browser UI)

### Mobile (iOS)

1. Visit app on Safari
2. Tap Share → "Add to Home Screen"
3. Verify custom icon appears
4. Launch app
5. Check standalone mode

---

**Ready?** → Open `instructions.md` to begin
