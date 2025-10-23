# Verification: PWA Manifest

Run these automated checks before proceeding to `checkpoint.md` for full manual testing.

---

## Prerequisites Verified ✓

```bash
# 1. Vite config exists
test -f vite.config.ts && echo "✅ vite.config.ts exists" || echo "❌ FAIL: Missing vite.config.ts"

# 2. App builds successfully
echo "Testing build..."
npm run build > /dev/null 2>&1 && echo "✅ Build succeeds" || echo "❌ FAIL: Build fails"

# 3. Required files exist
test -f src/App.tsx && echo "✅ src/App.tsx exists" || echo "❌ FAIL: Missing App.tsx"
test -f index.html && echo "✅ index.html exists" || echo "❌ FAIL: Missing index.html"
test -d public && echo "✅ public/ directory exists" || echo "❌ FAIL: Missing public/ directory"

# 4. Check for logo file (adjust path as needed)
if test -f logo.png || test -f logo.svg || test -f public/logo.png; then
  echo "✅ Logo file found"
else
  echo "⚠️  WARNING: Logo file not found (needed for icon generation)"
fi
```

---

## Files Created ✓

```bash
echo "Checking created files..."

# Vite PWA plugin installed
npm list vite-plugin-pwa > /dev/null 2>&1 && echo "✅ vite-plugin-pwa installed" || echo "❌ FAIL: vite-plugin-pwa not installed"

# Icon files
test -f public/icons/icon-16x16.png && echo "✅ icon-16x16.png exists" || echo "❌ FAIL: Missing icon-16x16.png"
test -f public/icons/icon-32x32.png && echo "✅ icon-32x32.png exists" || echo "❌ FAIL: Missing icon-32x32.png"
test -f public/icons/icon-192x192.png && echo "✅ icon-192x192.png exists" || echo "❌ FAIL: Missing icon-192x192.png"
test -f public/icons/icon-512x512.png && echo "✅ icon-512x512.png exists" || echo "❌ FAIL: Missing icon-512x512.png"
test -f public/icons/apple-touch-icon.png && echo "✅ apple-touch-icon.png exists" || echo "❌ FAIL: Missing apple-touch-icon.png"

# Shortcut icons
test -f public/icons/shortcut-add.png && echo "✅ shortcut-add.png exists" || echo "❌ FAIL: Missing shortcut-add.png"
test -f public/icons/shortcut-dashboard.png && echo "✅ shortcut-dashboard.png exists" || echo "❌ FAIL: Missing shortcut-dashboard.png"

# Hook and component
test -f src/hooks/useInstallPrompt.ts && echo "✅ useInstallPrompt.ts created" || echo "❌ FAIL: Missing useInstallPrompt.ts"
test -f src/components/InstallPrompt.tsx && echo "✅ InstallPrompt.tsx created" || echo "❌ FAIL: Missing InstallPrompt.tsx"

# Check InstallPrompt is imported in App.tsx
grep -q "InstallPrompt" src/App.tsx && echo "✅ InstallPrompt imported in App.tsx" || echo "⚠️  WARNING: InstallPrompt not imported in App.tsx"
```

---

## Manifest Validation ✓

```bash
echo "Validating manifest..."

# Build to generate manifest
npm run build > /dev/null 2>&1

# Check manifest exists
if test -f dist/manifest.webmanifest; then
  echo "✅ Manifest generated at dist/manifest.webmanifest"
else
  echo "❌ FAIL: Manifest not generated"
  exit 1
fi

# Validate JSON (requires jq - install with: brew install jq or apt-get install jq)
if command -v jq &> /dev/null; then
  if jq empty dist/manifest.webmanifest 2>&1; then
    echo "✅ Manifest is valid JSON"
  else
    echo "❌ FAIL: Manifest has invalid JSON"
    exit 1
  fi

  # Check required fields
  echo "Checking manifest fields..."
  NAME=$(jq -r '.name' dist/manifest.webmanifest)
  SHORT_NAME=$(jq -r '.short_name' dist/manifest.webmanifest)
  START_URL=$(jq -r '.start_url' dist/manifest.webmanifest)
  DISPLAY=$(jq -r '.display' dist/manifest.webmanifest)
  THEME_COLOR=$(jq -r '.theme_color' dist/manifest.webmanifest)

  test "$NAME" = "Household Hub - Financial Tracker" && echo "✅ name: $NAME" || echo "⚠️  name: $NAME (expected: Household Hub - Financial Tracker)"
  test "$SHORT_NAME" = "HouseholdHub" && echo "✅ short_name: $SHORT_NAME" || echo "⚠️  short_name: $SHORT_NAME (expected: HouseholdHub)"
  test "$START_URL" = "/?source=pwa" && echo "✅ start_url: $START_URL" || echo "⚠️  start_url: $START_URL (expected: /?source=pwa)"
  test "$DISPLAY" = "standalone" && echo "✅ display: $DISPLAY" || echo "❌ display: $DISPLAY"
  test "$THEME_COLOR" = "#1e40af" && echo "✅ theme_color: $THEME_COLOR" || echo "⚠️  theme_color: $THEME_COLOR (expected: #1e40af)"

  # Check icons array
  ICON_COUNT=$(jq '.icons | length' dist/manifest.webmanifest)
  test "$ICON_COUNT" -ge 2 && echo "✅ icons: $ICON_COUNT icons defined" || echo "❌ FAIL: Only $ICON_COUNT icons (need at least 2)"

  # Check shortcuts
  SHORTCUT_COUNT=$(jq '.shortcuts | length' dist/manifest.webmanifest)
  test "$SHORTCUT_COUNT" -ge 2 && echo "✅ shortcuts: $SHORTCUT_COUNT shortcuts defined" || echo "⚠️  shortcuts: $SHORTCUT_COUNT shortcuts"
else
  echo "⚠️  jq not installed - skipping detailed manifest validation"
  echo "   Install jq to enable: brew install jq (macOS) or apt-get install jq (Linux)"
fi
```

---

## Service Worker Registration ✓

```bash
echo "Checking service worker registration..."

# Check registerSW is imported
if grep -q "registerSW\|virtual:pwa-register" dist/index.html 2>/dev/null || \
   grep -q "registerSW\|virtual:pwa-register" dist/assets/*.js 2>/dev/null; then
  echo "✅ Service worker registration code present"
else
  echo "⚠️  WARNING: Service worker registration not detected"
fi

# Check sw.js or workbox files exist
if test -f dist/sw.js || ls dist/assets/workbox-*.js &> /dev/null; then
  echo "✅ Service worker files generated"
else
  echo "⚠️  WARNING: Service worker files not found"
fi
```

---

## Quick Smoke Test ✓

```bash
echo "Running smoke tests..."

# Start dev server in background
npm run dev > /dev/null 2>&1 &
DEV_PID=$!
echo "Starting dev server (PID: $DEV_PID)..."
sleep 5

# Test manifest accessible
if curl -s http://localhost:5173/manifest.webmanifest > /dev/null 2>&1; then
  echo "✅ Manifest accessible at /manifest.webmanifest"
else
  echo "❌ FAIL: Manifest not accessible"
fi

# Test icons accessible
if curl -s http://localhost:5173/icons/icon-192x192.png > /dev/null 2>&1; then
  echo "✅ Icons accessible"
else
  echo "❌ FAIL: Icons not accessible at /icons/"
fi

# Test app loads
if curl -s http://localhost:5173 | grep -q "<title>"; then
  echo "✅ App loads successfully"
else
  echo "❌ FAIL: App doesn't load"
fi

# Cleanup
kill $DEV_PID 2>/dev/null
echo "Dev server stopped"
```

---

## iOS Meta Tags Check ✓

```bash
echo "Checking iOS meta tags in index.html..."

grep -q "apple-mobile-web-app-capable" index.html && echo "✅ apple-mobile-web-app-capable present" || echo "❌ FAIL: Missing apple-mobile-web-app-capable"
grep -q "apple-mobile-web-app-status-bar-style" index.html && echo "✅ apple-mobile-web-app-status-bar-style present" || echo "❌ FAIL: Missing apple-mobile-web-app-status-bar-style"
grep -q "apple-mobile-web-app-title" index.html && echo "✅ apple-mobile-web-app-title present" || echo "❌ FAIL: Missing apple-mobile-web-app-title"
grep -q "apple-touch-icon" index.html && echo "✅ apple-touch-icon link present" || echo "❌ FAIL: Missing apple-touch-icon link"
```

---

## TypeScript Compilation ✓

```bash
echo "Checking TypeScript compilation..."

# Check for TypeScript errors
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
  echo "❌ FAIL: TypeScript errors detected"
  npx tsc --noEmit | head -20
else
  echo "✅ No TypeScript errors"
fi
```

---

## Summary

All checks passed? If yes, proceed to **checkpoint.md** for full manual testing.

**If any checks failed**:

1. Review the failed items above
2. Re-read the corresponding instruction steps
3. Fix the issues
4. Re-run this verification script

---

## Quick Run All Tests

Save this as `verify-041.sh` and run with `bash verify-041.sh`:

```bash
#!/bin/bash
set -e

echo "=========================================="
echo "Chunk 041: PWA Manifest Verification"
echo "=========================================="
echo ""

# Run all checks (copy all sections above)
# ...

echo ""
echo "=========================================="
echo "Verification complete!"
echo "=========================================="
```

**Estimated Time**: 5 minutes
