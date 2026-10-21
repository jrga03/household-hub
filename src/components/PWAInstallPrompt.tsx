/**
 * PWA Installation Prompt Component
 *
 * Provides a user-friendly installation prompt for PWA with:
 * - Cross-platform support (Chrome/Edge, iOS Safari, Firefox)
 * - beforeinstallprompt event handling for Chromium browsers
 * - Custom iOS instructions (incl. iPadOS, which reports as "Macintosh";
 *   Firefox-iOS gets "open in Safari" copy since it can't install itself)
 * - Dismissal with "don't show again" option
 * - Local storage persistence
 * - Responsive design with mobile-optimized layout
 *
 * @example
 * // Add to AppLayout or root component
 * <PWAInstallPrompt />
 */

import { useState, useEffect, useId, type ReactNode } from "react";
import { X, Download, Share } from "lucide-react";
import { Button } from "@/components/app/Button";
import { usePwaPromptStore } from "@/stores/pwaPromptStore";
import { reportError } from "@/lib/sentry";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

const DISMISSED_KEY = "pwa-install-dismissed";
const NEVER_SHOW_KEY = "pwa-install-never-show";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  // Coordination with the service-worker update toast (review R7): while an
  // update is pending the install card is suppressed so the two prompts never
  // compete for the same bottom slot. Suppression is render-only - the timers
  // and dismissal bookkeeping below keep running, so the iOS 3s-delay and
  // 7-day re-prompt behavior is preserved once the update clears.
  const updatePending = usePwaPromptStore((state) => state.updatePending);
  const [isIOS] = useState(() => {
    // iPadOS 13+ reports "Macintosh" in the UA (desktop-class browsing); no
    // real Mac has a touch screen, so Macintosh + multi-touch means iPad.
    const isIPadOS = navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || isIPadOS;
  });
  // Firefox on iOS has no "Add to Home Screen" in its share sheet, so it needs
  // "open in Safari" instructions. Safari and Chrome-iOS (CriOS) both offer it
  // directly (Chrome since iOS 16.4), so they share the standard copy.
  const [isFxiOS] = useState(() => navigator.userAgent.includes("FxiOS"));
  const [isStandalone] = useState(() => {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as NavigatorStandalone).standalone === true
    );
  });

  useEffect(() => {
    // Check if user dismissed or opted out
    const neverShow = localStorage.getItem(NEVER_SHOW_KEY) === "true";
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    const dismissedDate = dismissed ? new Date(dismissed) : null;
    const daysSinceDismissal = dismissedDate
      ? (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    // Don't show if already installed, user opted out, or dismissed within 7 days
    if (isStandalone || neverShow || daysSinceDismissal < 7) {
      return;
    }

    // Both timer ids are kept so cleanup can cancel them: without the
    // clearTimeouts an unmount inside the 2s/3s window left a state update
    // firing against an unmounted component (deferred from Phase 5 to here).
    let chromiumTimer: number | undefined;
    let iosTimer: number | undefined;

    // Handle beforeinstallprompt for Chromium browsers
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show prompt after short delay for better UX
      chromiumTimer = window.setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // For iOS, show prompt after delay if criteria met
    if (isIOS && !isStandalone) {
      iosTimer = window.setTimeout(() => setShowPrompt(true), 3000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.clearTimeout(chromiumTimer);
      window.clearTimeout(iosTimer);
    };
  }, [isIOS, isStandalone]);

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
      reportError(error, { subsystem: "ui", operation: "pwa-install" });
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

  // Don't render if already installed, shouldn't show, or an app update is
  // pending (the update toast owns the user's attention, review R7)
  if (isStandalone || !showPrompt || updatePending) {
    return null;
  }

  if (isIOS) {
    return (
      <InstallCard description="Add to your home screen" onDismiss={handleDismiss}>
        <p className="text-muted-foreground">Install it for quick access and offline use:</p>
        <ol className="list-decimal space-y-2 pl-4">
          {isFxiOS && (
            // Firefox on iOS can't add to the home screen itself; the install has to happen from Safari.
            <li>
              Open this page in <strong>Safari</strong>
            </li>
          )}
          <li>
            Tap the <Share aria-label="Share" className="inline size-4 align-text-bottom" /> share
            button
          </li>
          <li>
            Choose <strong>“Add to Home Screen”</strong>
          </li>
          {!isFxiOS && (
            <li>
              Tap <strong>“Add”</strong>
            </li>
          )}
        </ol>
        <Button variant="outline" className="w-full" onClick={handleNeverShow}>
          Don’t show again
        </Button>
      </InstallCard>
    );
  }

  return (
    <InstallCard description="Get quick access and work offline" onDismiss={handleDismiss}>
      <div className="flex gap-2">
        <Button onClick={() => void handleInstall()} className="flex-1">
          <Download aria-hidden="true" />
          Install
        </Button>
        <Button variant="outline" onClick={handleNeverShow}>
          Not now
        </Button>
      </div>
    </InstallCard>
  );
}

/** A floating panel above the bottom chrome, not modal: the page stays usable behind it. */
function InstallCard({
  description,
  onDismiss,
  children,
}: {
  description: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed right-[calc(1rem+var(--safe-area-right))] bottom-[calc(1rem+var(--bottom-chrome))] left-[calc(1rem+var(--safe-area-left))] z-50 space-y-4 rounded-lg border bg-popover p-4 text-body text-popover-foreground shadow-float medium:left-auto medium:w-96"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
        >
          <span className="text-body font-bold">HH</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-heading">
            Install Household Hub
          </h2>
          <p id={descriptionId} className="text-caption text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mt-2 -mr-2 size-11"
          onClick={onDismiss}
          aria-label="Dismiss install prompt"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {children}
    </section>
  );
}
