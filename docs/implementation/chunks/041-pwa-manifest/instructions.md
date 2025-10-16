# Instructions: PWA Manifest

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Install Vite PWA Plugin (5 min)

```bash
npm install -D vite-plugin-pwa
```

**Verify**: Package appears in `package.json` devDependencies

---

## Step 2: Configure Vite PWA Plugin (10 min)

Update `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "splash/*.jpg"],
      manifest: {
        name: "Household Hub",
        short_name: "HHub",
        description: "Offline-first household financial tracker",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["finance", "productivity"],
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        shortcuts: [
          {
            name: "Add Transaction",
            short_name: "Add",
            description: "Quickly add a new transaction",
            url: "/transactions/new",
            icons: [
              {
                src: "/icons/shortcut-add.png",
                sizes: "96x96",
              },
            ],
          },
          {
            name: "View Dashboard",
            short_name: "Dashboard",
            description: "View your financial dashboard",
            url: "/dashboard",
            icons: [
              {
                src: "/icons/shortcut-dashboard.png",
                sizes: "96x96",
              },
            ],
          },
        ],
      },
      workbox: {
        // Service worker config (will expand in chunk 042)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
});
```

**Verify**: No TypeScript errors

---

## Step 3: Create App Icons (15 min)

Create icon directory:

```bash
mkdir -p public/icons
```

**Option A: Use existing logo** (if you have a logo):

```bash
# Install sharp for icon generation
npm install -D sharp-cli

# Generate icons from logo.png (512x512 or larger)
npx sharp -i logo.png -o public/icons/icon-192x192.png resize 192 192
npx sharp -i logo.png -o public/icons/icon-512x512.png resize 512 512
npx sharp -i logo.png -o public/icons/icon-16x16.png resize 16 16
npx sharp -i logo.png -o public/icons/icon-32x32.png resize 32 32
npx sharp -i logo.png -o public/icons/apple-touch-icon.png resize 180 180
```

**Option B: Use placeholder** (for testing):

Create simple icons using this script `scripts/generate-icons.js`:

```javascript
// Quick placeholder icon generator
import fs from "fs";
import { createCanvas } from "canvas"; // npm install canvas

const sizes = [16, 32, 96, 192, 512];
const colors = {
  background: "#ffffff",
  text: "#1f2937",
};

sizes.forEach((size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, size, size);

  // Border
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = Math.max(2, size / 32);
  ctx.strokeRect(0, 0, size, size);

  // Text
  ctx.fillStyle = colors.text;
  ctx.font = `bold ${size / 2}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("HH", size / 2, size / 2);

  // Save
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(`public/icons/icon-${size}x${size}.png`, buffer);
  console.log(`Generated icon-${size}x${size}.png`);
});

// Apple touch icon
const appleSize = 180;
const appleCanvas = createCanvas(appleSize, appleSize);
const appleCtx = appleCanvas.getContext("2d");
appleCtx.fillStyle = colors.background;
appleCtx.fillRect(0, 0, appleSize, appleSize);
appleCtx.fillStyle = colors.text;
appleCtx.font = `bold ${appleSize / 2}px Arial`;
appleCtx.textAlign = "center";
appleCtx.textBaseline = "middle";
appleCtx.fillText("HH", appleSize / 2, appleSize / 2);
fs.writeFileSync("public/icons/apple-touch-icon.png", appleCanvas.toBuffer("image/png"));
console.log("Generated apple-touch-icon.png");
```

Run:

```bash
npm install -D canvas
node scripts/generate-icons.js
```

**Note**: For production, replace with branded icons.

---

## Step 4: Add iOS Meta Tags (5 min)

Update `index.html` in `<head>`:

```html
<!-- PWA Meta Tags -->
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#ffffff" />

<!-- iOS Meta Tags -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Household Hub" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

<!-- iOS Splash Screens (basic) -->
<link
  rel="apple-touch-startup-image"
  media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
  href="/splash/apple-splash-1290-2796.jpg"
/>

<!-- Microsoft Meta Tags -->
<meta name="msapplication-TileColor" content="#ffffff" />
<meta name="msapplication-TileImage" content="/icons/icon-192x192.png" />
```

---

## Step 5: Create Install Prompt Hook (10 min)

Create `src/hooks/useInstallPrompt.ts`:

```typescript
import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Capture install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) {
      return false;
    }

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      return true;
    }

    return false;
  };

  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const showIOSInstructions = isIOS && !isInstalled;

  return {
    isInstallable: isInstallable || showIOSInstructions,
    isInstalled,
    isIOS: showIOSInstructions,
    promptInstall,
  };
}
```

---

## Step 6: Create Install Prompt Component (10 min)

Create `src/components/InstallPrompt.tsx`:

```typescript
import { X, Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useState } from 'react';

export function InstallPrompt() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [isOpen, setIsOpen] = useState(false);

  // Don't show if already installed
  if (isInstalled || !isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    if (isIOS) {
      // Show instructions for iOS
      setIsOpen(true);
    } else {
      // Trigger native install prompt
      const success = await promptInstall();
      if (success) {
        setIsOpen(false);
      }
    }
  };

  return (
    <>
      {/* Floating install button */}
      <div className="fixed bottom-4 right-4 z-50 md:bottom-8 md:right-8">
        <Button
          onClick={handleInstall}
          size="lg"
          className="shadow-lg"
          aria-label="Install Household Hub"
        >
          <Download className="w-5 h-5 mr-2" />
          Install App
        </Button>
      </div>

      {/* iOS Instructions Dialog */}
      {isIOS && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Install Household Hub</DialogTitle>
              <DialogDescription>
                Add Household Hub to your home screen for the best experience.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Share className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">1. Tap the Share button</p>
                  <p className="text-sm text-muted-foreground">
                    Located at the bottom of the Safari browser
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-medium">+</span>
                </div>
                <div>
                  <p className="font-medium">2. Tap "Add to Home Screen"</p>
                  <p className="text-sm text-muted-foreground">
                    Scroll down in the share menu to find this option
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-medium">✓</span>
                </div>
                <div>
                  <p className="font-medium">3. Tap "Add"</p>
                  <p className="text-sm text-muted-foreground">
                    The app icon will appear on your home screen
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={() => setIsOpen(false)} className="w-full">
              Got it
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
```

Install shadcn/ui Dialog if needed:

```bash
npx shadcn-ui@latest add dialog
```

---

## Step 7: Add Install Prompt to App (5 min)

Update `src/App.tsx` or root layout:

```typescript
import { InstallPrompt } from '@/components/InstallPrompt';

function App() {
  return (
    <>
      {/* Your app content */}
      <YourAppRoutes />

      {/* Install prompt (conditionally rendered) */}
      <InstallPrompt />
    </>
  );
}
```

---

## Step 8: Build and Test (10 min)

```bash
# Build with PWA plugin
npm run build

# Preview production build
npm run preview
```

**Test in browser**:

1. Open DevTools → Application → Manifest
2. Verify all manifest fields populated
3. Check "Service Workers" tab (should register)
4. Test install prompt (may need to engage with app first)

**Test on mobile**:

1. Deploy to staging or use `npm run dev -- --host`
2. Access from mobile device on same network
3. Android: Install prompt should appear
4. iOS: Use Share → Add to Home Screen

---

## Done!

When the install prompt appears and app installs successfully, proceed to checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Install Criteria**:

Chrome requires:

- HTTPS (or localhost)
- Manifest with required fields
- Service worker registered
- User engagement (visiting 2+ pages, or 30s dwell time)

**Testing Install Prompt**:

Force install prompt in Chrome DevTools:

1. Application → Manifest → Click "Add to home screen" button
2. Or: Console → `window.dispatchEvent(new Event('beforeinstallprompt'))`

**Debugging**:

Check Chrome DevTools → Application → Manifest for errors:

- Missing icons
- Invalid manifest JSON
- Service worker issues
- HTTPS problems
