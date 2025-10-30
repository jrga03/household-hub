# Checkpoint: PWA Manifest

Run these verifications to ensure everything works correctly.

**IMPORTANT**: First run `verification.md` automated checks. Only proceed here if all automated checks pass.

---

## 1. Vite Build Succeeds ✓

```bash
npm run build
```

**Expected**:

- Build completes without errors
- `dist/manifest.webmanifest` generated
- `dist/registerSW.js` present
- Icons copied to `dist/icons/`

---

## 2. Manifest Validates ✓

Open Chrome DevTools → Application → Manifest

**Check**:

- [ ] Name: "Household Hub - Financial Tracker"
- [ ] Short name: "HouseholdHub"
- [ ] Theme color: #1e40af
- [ ] Display override: ["window-controls-overlay", "standalone", "minimal-ui"]
- [ ] Orientation: any
- [ ] Lang: en-US
- [ ] Dir: ltr
- [ ] Start URL: /?source=pwa
- [ ] Display: standalone
- [ ] Icons: 192x192 and 512x512 present
- [ ] Start URL: /
- [ ] Shortcuts: 2 shortcuts defined

**Expected**: No warnings or errors in Console

---

## 3. Icons Present ✓

```bash
ls -la public/icons/
```

**Expected files**:

```
icon-16x16.png
icon-32x32.png
icon-192x192.png
icon-512x512.png
apple-touch-icon.png
shortcut-add.png
shortcut-dashboard.png
```

**Visual check**:

- Open each icon in browser
- Verify they display correctly
- Check resolution is correct

---

## 4. Service Worker Registers ✓

Open Chrome DevTools → Application → Service Workers

**Expected**:

- Service worker shows as "activated and running"
- Status: Green dot
- Scope: "/"
- Source: `/sw.js` or `/registerSW.js`

```bash
# Check in console
navigator.serviceWorker.getRegistrations().then(console.log)
```

**Output should include** registration with scope "/"

---

## 5. Install Prompt Works ✓

### Desktop (Chrome/Edge)

**Test A: Automatic prompt**

1. Clear site data (DevTools → Application → Clear storage)
2. Clear localStorage: `localStorage.clear()`
3. Reload page 3+ times (to trigger visit counter)
4. **Expected**: Install banner appears bottom-left (mobile) or bottom-right (desktop)
5. Banner shows app icon, "Install" button, and "Not now" button

**Test B: Manual prompt**

1. Open DevTools → Application → Manifest
2. Click "Add to home screen" button at top
3. **Expected**: Install dialog appears
4. Click "Install"
5. **Expected**: App opens in standalone window

**Verify installed app**:

- [ ] Window has no browser address bar
- [ ] Custom title "Household Hub"
- [ ] Launches from desktop/start menu
- [ ] Custom icon appears

### Mobile (Android)

1. Visit app on Chrome mobile
2. Interact with app (scroll, navigate)
3. **Expected**: Banner or install button appears
4. Tap "Add to Home Screen"
5. **Expected**: App added to home screen
6. Launch app from home screen
7. **Expected**: Opens in standalone mode (no browser UI)

### Mobile (iOS Safari)

1. Visit app on Safari
2. Tap Share button (middle bottom)
3. Scroll and tap "Add to Home Screen"
4. **Expected**: Preview shows app icon and name
5. Tap "Add"
6. **Expected**: Icon appears on home screen
7. Launch app
8. **Expected**: Runs in standalone mode

**Verify**:

- [ ] Custom icon visible on home screen
- [ ] Tap launches app fullscreen
- [ ] No Safari UI visible
- [ ] Status bar matches theme color

---

## 6. Install Hook Works ✓

Test `useInstallPrompt` hook:

```typescript
// In a test component
const { isInstallable, isInstalled, isIOS, promptInstall, dismissPrompt } = useInstallPrompt();

console.log({
  isInstallable,
  isInstalled,
  isIOS,
});
```

**Expected on desktop**:

- `isInstallable: true` (after engagement)
- `isInstalled: false` (before install)
- `isIOS: false`

**Expected on iOS**:

- `isInstallable: true`
- `isInstalled: false`
- `isIOS: true`

**Expected after install**:

- `isInstalled: true`
- `isInstallable: false`

**Expected after dismissal**:

- `localStorage.getItem('install-prompt-dismissed')` === 'true'
- Prompt doesn't show on reload
- `isInstallable: false`

---

## 7. InstallPrompt Component Renders ✓

**Visual check**:

- [ ] Install banner appears (after 3+ visits)
- [ ] Banner shows app icon from /icons/icon-192x192.png
- [ ] Banner shows "Install Household Hub" heading
- [ ] Banner shows "Install" and "Not now" buttons
- [ ] Banner has close X button in top-right
- [ ] Clicking "Install" triggers install (non-iOS)
- [ ] Clicking "Not now" dismisses banner
- [ ] iOS shows instruction dialog with 3-step guide

**iOS dialog check**:

- [ ] Dialog opens on install button click
- [ ] Shows 3-step instructions
- [ ] Icons display correctly
- [ ] "Got it" button closes dialog
- [ ] Can dismiss with X button or ESC

---

## 8. Standalone Mode Detection ✓

Test standalone mode detection:

```javascript
// In browser console
console.log("Standalone:", window.matchMedia("(display-mode: standalone)").matches);
```

**Expected**:

- `false` when in browser
- `true` when installed and launched

**Verify in installed app**:

```typescript
if (window.matchMedia("(display-mode: standalone)").matches) {
  // This should run in installed app
  console.log("Running in standalone mode");
}
```

---

## 9. Shortcuts Work ✓

**For installed app only**:

**Desktop**:

- Right-click app icon
- **Expected**: Context menu shows shortcuts
  - "Add Transaction"
  - "View Dashboard"
- Click shortcut
- **Expected**: App opens to that route

**Android**:

- Long-press app icon
- **Expected**: Shortcuts appear
- Tap shortcut
- **Expected**: App launches to route

**Note**: iOS doesn't support app shortcuts yet

---

## 10. Accessibility ✓

**Install button**:

- [ ] Keyboard navigable (Tab to focus)
- [ ] Enter/Space activates
- [ ] ARIA label present: "Install Household Hub"
- [ ] Focus visible (outline appears)

**iOS dialog**:

- [ ] Focus trapped in dialog
- [ ] ESC closes dialog
- [ ] Screen reader announces title
- [ ] Instructions readable by screen reader

**Test with screen reader**:

```bash
# Enable VoiceOver (macOS)
# Cmd+F5

# Navigate to install button
# Verify announces: "Install Household Hub, button"
```

---

## 11. Manifest JSON Validation ✓

Check generated manifest:

```bash
cat dist/manifest.webmanifest | jq
```

**Expected structure**:

```json
{
  "name": "Household Hub - Financial Tracker",
  "short_name": "HouseholdHub",
  "description": "Offline-first household financial tracker",
  "theme_color": "#1e40af",
  "background_color": "#ffffff",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "orientation": "any",
  "lang": "en-US",
  "dir": "ltr",
  "scope": "/",
  "start_url": "/?source=pwa",
  "categories": ["finance", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "shortcuts": [...]
}
```

**Validate online**:

- Visit: https://manifest-validator.appspot.com/
- Paste manifest JSON
- **Expected**: No errors

---

## 12. Cross-Browser Check ✓

### Chrome/Edge ✓

- [ ] Manifest loads
- [ ] Service worker registers
- [ ] Install prompt works
- [ ] App installs successfully

### Firefox ✓

- [ ] Manifest loads (check DevTools)
- [ ] Service worker registers
- [ ] No install prompt (expected - Firefox doesn't support)
- [ ] App functions normally

### Safari (Desktop) ✓

- [ ] Manifest loads
- [ ] Service worker registers
- [ ] No install prompt (expected)
- [ ] App functions normally

### Safari (iOS) ✓

- [ ] Custom icon shows in Add to Home Screen
- [ ] Splash screen appears (if configured)
- [ ] Standalone mode works
- [ ] Status bar styled correctly

---

## Success Criteria

- [ ] `npm run build` completes without errors
- [ ] Manifest validates with no warnings
- [ ] All icon sizes present and load correctly
- [ ] Service worker registers successfully
- [ ] Install prompt appears (Chrome/Edge)
- [ ] Install button renders correctly
- [ ] iOS instructions dialog works
- [ ] App installs on desktop successfully
- [ ] App installs on mobile (Android/iOS)
- [ ] Standalone mode detected correctly
- [ ] Shortcuts appear in installed app
- [ ] Accessibility checks pass
- [ ] Cross-browser compatibility verified

---

## Common Issues

### Issue: Install prompt never appears

**Solution**: Check DevTools console for errors, verify:

- HTTPS enabled (or localhost)
- Service worker registered
- User engagement threshold met (30s or 2 pages)
- Manifest valid

### Issue: Icons don't display

**Solution**: Check icon paths in manifest match actual files:

```bash
ls public/icons/
# Verify files exist and match manifest
```

### Issue: "Site cannot be installed"

**Solution**: Validate manifest:

- Open DevTools → Application → Manifest
- Fix any listed errors
- Verify display mode is "standalone" or "minimal-ui"

### Issue: iOS app doesn't go fullscreen

**Solution**: Check meta tags in index.html:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
```

---

## Next Steps

Once all checkpoints pass:

1. Commit PWA manifest code
2. Test on multiple devices
3. Move to **Chunk 042: Service Worker**

---

**Estimated Time**: 20-30 minutes to verify all checkpoints
