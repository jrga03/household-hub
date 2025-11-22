/**
 * PWA Installation Prompt Component
 *
 * Provides a user-friendly installation prompt for PWA with:
 * - Cross-platform support (Chrome/Edge, iOS Safari, Firefox)
 * - beforeinstallprompt event handling for Chromium browsers
 * - Custom iOS Safari instructions
 * - Dismissal with "don't show again" option
 * - Local storage persistence
 * - Responsive design with mobile-optimized layout
 *
 * @example
 * // Add to AppLayout or root component
 * <PWAInstallPrompt />
 */

import { useState, useEffect } from "react";
import { X, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";
const NEVER_SHOW_KEY = "pwa-install-never-show";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Check if user dismissed or opted out
    const neverShow = localStorage.getItem(NEVER_SHOW_KEY) === "true";
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    const dismissedDate = dismissed ? new Date(dismissed) : null;
    const daysSinceDismissal = dismissedDate
      ? (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    // Don't show if already installed, user opted out, or dismissed within 7 days
    if (standalone || neverShow || daysSinceDismissal < 7) {
      return;
    }

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Handle beforeinstallprompt for Chromium browsers
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show prompt after short delay for better UX
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // For iOS, show prompt after delay if criteria met
    if (iOS && !standalone) {
      setTimeout(() => setShowPrompt(true), 3000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        console.log("PWA installed");
      }

      setDeferredPrompt(null);
      setShowPrompt(false);
    } catch (error) {
      console.error("Installation error:", error);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    setShowPrompt(false);
  };

  const handleNeverShow = () => {
    localStorage.setItem(NEVER_SHOW_KEY, "true");
    setShowPrompt(false);
  };

  // Don't render if already installed or shouldn't show
  if (isStandalone || !showPrompt) {
    return null;
  }

  // iOS Safari installation instructions
  if (isIOS) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:w-96">
        <Card className="border-2 border-primary shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <span className="text-sm font-bold">HH</span>
                </div>
                <div>
                  <CardTitle className="text-base">Install Household Hub</CardTitle>
                  <CardDescription className="text-xs">Add to your home screen</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDismiss}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Install this app for quick access and offline support:
              </p>
              <ol className="space-y-2 pl-4 list-decimal">
                <li className="flex items-center gap-2">
                  Tap the <Share className="inline h-4 w-4" /> share button
                </li>
                <li className="flex items-center gap-2">
                  Select <strong>"Add to Home Screen"</strong>
                </li>
                <li>
                  Tap <strong>"Add"</strong> to install
                </li>
              </ol>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={handleNeverShow}>
                Don't show again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Chromium/Edge installation prompt
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:w-96">
      <Card className="border-2 border-primary shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-sm font-bold">HH</span>
              </div>
              <div>
                <CardTitle className="text-base">Install Household Hub</CardTitle>
                <CardDescription className="text-xs">
                  Get quick access and work offline
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>✓ Faster loading times</p>
            <p>✓ Works offline</p>
            <p>✓ Desktop shortcut</p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleInstall} className="flex-1" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Install
            </Button>
            <Button variant="outline" size="sm" onClick={handleNeverShow}>
              Not now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
