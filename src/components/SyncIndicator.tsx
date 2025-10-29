import { useEffect, useMemo, useState } from "react";
import { Wifi, WifiOff, RefreshCw, AlertCircle } from "lucide-react";
import { useSyncStore } from "@/stores/syncStore";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * SyncIndicator - Displays realtime connection and sync status
 *
 * Visual States:
 * - online: Green Wifi icon - Connected to server
 * - offline: Red WifiOff icon - No network connection
 * - syncing: Blue spinning RefreshCw icon - Actively syncing data
 * - error: Yellow AlertCircle icon - Sync error occurred
 *
 * Features:
 * - Real-time status updates via syncStore
 * - Browser online/offline event listening
 * - Pending changes count with badge
 * - Detailed tooltip with last sync time
 *
 * Accessibility:
 * - ARIA labels for connection status
 * - Semantic HTML structure
 * - Keyboard accessible tooltip
 * - Screen reader friendly status text
 */
export function SyncIndicator() {
  const { status, lastSyncTime, pendingChanges } = useSyncStore();
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Update current time every 10 seconds for relative time display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Listen to browser online/offline events
  useEffect(() => {
    function handleOnline() {
      useSyncStore.getState().setStatus("online");
    }

    function handleOffline() {
      useSyncStore.getState().setStatus("offline");
    }

    // Set initial status based on current network state
    useSyncStore.getState().setStatus(navigator.onLine ? "online" : "offline");

    // Register event listeners
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /**
   * Get appropriate icon based on current sync status
   */
  const getIcon = () => {
    switch (status) {
      case "online":
        return <Wifi className="w-4 h-4 text-green-500" aria-label="Connected" role="img" />;
      case "offline":
        return <WifiOff className="w-4 h-4 text-red-500" aria-label="Offline" role="img" />;
      case "syncing":
        return (
          <RefreshCw
            className="w-4 h-4 text-blue-500 animate-spin"
            aria-label="Syncing"
            role="img"
          />
        );
      case "error":
        return (
          <AlertCircle className="w-4 h-4 text-yellow-500" aria-label="Sync Error" role="img" />
        );
    }
  };

  /**
   * Get user-friendly status text
   */
  const getStatusText = () => {
    switch (status) {
      case "online":
        return "Connected";
      case "offline":
        return "Offline";
      case "syncing":
        return "Syncing...";
      case "error":
        return "Sync Error";
    }
  };

  /**
   * Build detailed tooltip content with:
   * - Current connection status
   * - Last sync time (relative)
   * - Pending changes count (if > 0)
   *
   * IMPORTANT: Memoized to avoid impure Date.now() calls during render.
   * This prevents React purity violations and unnecessary re-renders.
   */
  const tooltipContent = useMemo(() => {
    const parts: string[] = [getStatusText()];

    if (lastSyncTime) {
      const elapsed = currentTime - lastSyncTime.getTime();
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      // Format relative time
      if (hours > 0) {
        parts.push(`Last sync: ${hours}h ago`);
      } else if (minutes > 0) {
        parts.push(`Last sync: ${minutes}m ago`);
      } else {
        parts.push(`Last sync: ${seconds}s ago`);
      }
    } else {
      parts.push("Never synced");
    }

    if (pendingChanges > 0) {
      parts.push(`${pendingChanges} pending change${pendingChanges === 1 ? "" : "s"}`);
    }

    return parts.join("\n");
  }, [currentTime, lastSyncTime, pendingChanges, getStatusText]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center gap-2 cursor-pointer"
          role="status"
          aria-live="polite"
          aria-label={tooltipContent.replace(/\n/g, ", ")}
        >
          {getIcon()}
          <span className="text-sm text-muted-foreground">{getStatusText()}</span>
          {pendingChanges > 0 && (
            <Badge
              variant="secondary"
              className="ml-2"
              aria-label={`${pendingChanges} pending changes`}
            >
              {pendingChanges}
            </Badge>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <pre className="text-xs whitespace-pre-wrap font-sans">{tooltipContent}</pre>
      </TooltipContent>
    </Tooltip>
  );
}
