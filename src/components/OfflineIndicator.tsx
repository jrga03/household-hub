import { WifiOff } from "lucide-react";
import { useServiceWorker } from "@/hooks/useServiceWorker";

/**
 * OfflineIndicator component displays a fixed banner at the top of the screen when offline
 *
 * Features:
 * - Only visible when the app detects no internet connection
 * - Fixed at top with high z-index to overlay all content
 * - Yellow/warning color scheme for visibility
 * - Informs users that changes will sync when reconnected
 *
 * Note: This is separate from the existing OfflineBanner component and both can coexist
 */
export function OfflineIndicator() {
  const { isOffline } = useServiceWorker();

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-yellow-900 px-4 py-2 text-center z-50">
      <div className="flex items-center justify-center gap-2 text-sm font-medium">
        <WifiOff className="h-4 w-4" />
        You're offline - Changes will sync when connection is restored
      </div>
    </div>
  );
}
