import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  // Handle manual retry - trigger background sync instead of full reload
  const handleRetry = async () => {
    await queryClient.invalidateQueries({ queryKey: ["transactions", "sync"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts", "sync"] });
    await queryClient.invalidateQueries({ queryKey: ["categories", "sync"] });
  };

  // Don't show banner when online
  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2">
        <WifiOff className="h-5 w-5" />
        <span className="font-medium">
          {"You're offline. Changes will sync when connection is restored."}
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRetry}
        className="text-yellow-950 hover:bg-yellow-600"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Retry
      </Button>
    </div>
  );
}
