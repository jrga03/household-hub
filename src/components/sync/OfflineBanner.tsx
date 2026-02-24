import { useState, useEffect, useCallback } from "react";
import { CloudOff, Wifi, X } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface OfflineBannerProps {
  /**
   * Optional className for additional styling
   */
  className?: string;
  /**
   * Whether user can dismiss the banner
   * @default true
   */
  dismissible?: boolean;
}

/**
 * OfflineBanner Component
 *
 * Displays a prominent banner when the app goes offline, informing users that:
 * - They can continue working offline
 * - Changes will sync when connection is restored
 * - All data is saved locally
 *
 * Features:
 * - Smooth slide-in/out animations
 * - Auto-dismisses when connection is restored
 * - Optional manual dismiss
 * - Celebration message when back online
 *
 * @example
 * // In app layout
 * <OfflineBanner />
 *
 * @example
 * // Non-dismissible variant
 * <OfflineBanner dismissible={false} />
 */
export function OfflineBanner({ className, dismissible = true }: OfflineBannerProps) {
  const isOnline = useOnlineStatus();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  // Auto-clear dismiss when user comes back online so banner reappears on next offline.
  // This is the React-recommended pattern for adjusting state during render
  // (replaces getDerivedStateFromProps). Safe because when online the banner is hidden.
  const [prevIsOnline, setPrevIsOnline] = useState(isOnline);
  if (isOnline !== prevIsOnline) {
    setPrevIsOnline(isOnline);
    if (isOnline && isDismissed) {
      setIsDismissed(false);
    }
  }

  // Show "reconnected" banner for 3 seconds when coming back online
  const handleReconnection = useCallback(() => {
    setShowReconnected(true);
  }, []);

  // Listen for browser online event to trigger reconnection message
  useEffect(() => {
    window.addEventListener("online", handleReconnection);
    return () => window.removeEventListener("online", handleReconnection);
  }, [handleReconnection]);

  // Auto-hide reconnected banner after 3 seconds
  useEffect(() => {
    if (!showReconnected) return;
    const timer = setTimeout(() => {
      setShowReconnected(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [showReconnected]);

  // Don't show anything if online and not showing reconnect message
  if (isOnline && !showReconnected) {
    return null;
  }

  // Don't show if dismissed (only for offline state)
  if (isDismissed && !isOnline) {
    return null;
  }

  // Reconnected message
  if (showReconnected) {
    return (
      <div
        className={cn(
          "fixed top-[calc(4rem+var(--safe-area-top))] left-0 right-0 z-40 animate-in slide-in-from-top duration-300",
          className
        )}
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <Wifi className="h-5 w-5 text-green-600 dark:text-green-500" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  Back online!
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                  Your changes are syncing to the cloud
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Offline banner
  return (
    <div
      className={cn(
        "fixed top-[calc(4rem+var(--safe-area-top))] left-0 right-0 z-40 animate-in slide-in-from-top duration-300",
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0">
              <CloudOff className="h-5 w-5 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Working offline
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Changes are saved locally and will sync when you&apos;re back online
              </p>
            </div>
          </div>
          {dismissible && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsDismissed(true)}
              className="flex-shrink-0 text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-900/50"
              aria-label="Dismiss offline banner"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
