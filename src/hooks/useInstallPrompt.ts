import { useState, useEffect, useRef } from "react";
import type {} from "@/types/window";

export function useInstallPrompt() {
  const hasIncrementedRef = useRef(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Initialize from display mode check (prevents synchronous setState in effect)
  const [isInstalled, setIsInstalled] = useState(() => {
    return window.matchMedia("(display-mode: standalone)").matches;
  });

  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("install-prompt-dismissed") === "true";
  });

  useEffect(() => {
    // Increment visit counter only once per session
    if (!hasIncrementedRef.current) {
      const visits = parseInt(localStorage.getItem("visits") || "0", 10);
      localStorage.setItem("visits", String(visits + 1));
      hasIncrementedRef.current = true;
    }

    // Early return if already installed or dismissed
    if (isInstalled || dismissed) {
      return;
    }

    // Capture install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Read fresh visit count from localStorage
      const currentVisits = parseInt(localStorage.getItem("visits") || "0", 10);
      if (currentVisits >= 3) {
        setIsInstallable(true);
      }
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      console.log("[PWA] App installed successfully");
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
  }, [dismissed, isInstalled]);

  const promptInstall = async () => {
    if (!deferredPrompt) {
      console.warn("[PWA] No deferred prompt available");
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === "accepted") {
        console.log("[PWA] User accepted installation");
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
        return true;
      } else {
        console.log("[PWA] User dismissed installation");
        return false;
      }
    } catch (error) {
      console.error("[PWA] Error during install prompt:", error);
      setIsInstallable(false);
      setDeferredPrompt(null);
      return false;
    }
  };

  // Improved iOS detection
  const isIOS = (() => {
    const ua = navigator.userAgent;
    const isIPad =
      /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isIPhone = /iPhone|iPod/.test(ua);

    return isIPad || isIPhone;
  })();

  const showIOSInstructions = isIOS && !isInstalled && !dismissed;

  const dismissPrompt = () => {
    console.log("[PWA] User dismissed install prompt");
    localStorage.setItem("install-prompt-dismissed", "true");
    setDismissed(true);
    setIsInstallable(false);
  };

  return {
    isInstallable: (isInstallable || showIOSInstructions) && !dismissed,
    isInstalled,
    isIOS: showIOSInstructions,
    promptInstall,
    dismissPrompt,
  };
}
