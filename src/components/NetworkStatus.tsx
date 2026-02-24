/**
 * NetworkStatus Component
 *
 * Displays a global banner when the device is offline, informing users that
 * their changes will sync when they come back online.
 *
 * Key Features:
 * - Listens to navigator.onLine for initial state
 * - Listens to window 'online' and 'offline' events for state changes
 * - Only displays when offline (hidden when online)
 * - Positioned at bottom-left with fixed positioning
 * - Uses amber color to indicate informational state (not an error)
 *
 * This component should be added to the root App component to provide
 * global network status visibility across all pages.
 *
 * @example
 * // In App.tsx
 * function App() {
 *   return (
 *     <>
 *       <YourAppContent />
 *       <NetworkStatus />
 *     </>
 *   );
 * }
 *
 * @module components/NetworkStatus
 */

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/**
 * Global network status indicator component
 *
 * Displays a fixed banner at the bottom-left of the screen when offline.
 * Automatically hides when online.
 *
 * The banner provides reassurance that:
 * - The app continues to work offline
 * - Changes are being tracked locally
 * - Everything will sync when connectivity returns
 *
 * Accessibility:
 * - Uses semantic HTML for screen reader compatibility
 * - WifiOff icon provides visual indicator
 * - Text message explains the current state
 *
 * @returns JSX element (banner) or null if online
 */
export function NetworkStatus() {
  // Initialize with current online status
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    // Event handlers
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Add event listeners
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Cleanup on unmount
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Don't render anything when online
  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-[calc(1rem+var(--safe-area-bottom))] left-[calc(1rem+var(--safe-area-left))] z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white shadow-lg"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>Offline - changes will sync when online</span>
    </div>
  );
}
