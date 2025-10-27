import { useQuery } from "@tanstack/react-query";
import { cacheManager } from "@/lib/offline/cacheManager";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function SyncStatus() {
  const isOnline = useOnlineStatus();

  // Query last sync time
  const { data: lastSync } = useQuery({
    queryKey: ["lastSync"],
    queryFn: () => cacheManager.getLastSync(),
    refetchInterval: 60000, // Update every minute
  });

  // Query pending count
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pendingCount"],
    queryFn: () => cacheManager.getPendingCount(),
    refetchInterval: 5000, // Update every 5 seconds
  });

  const getStatusIcon = () => {
    if (!isOnline) {
      return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    }
    if (pendingCount > 0) {
      return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
    }
    return <Check className="h-4 w-4 text-green-600" />;
  };

  const getStatusText = () => {
    if (!isOnline) {
      return "Offline";
    }
    if (pendingCount > 0) {
      return `Syncing ${pendingCount} change${pendingCount === 1 ? "" : "s"}...`;
    }
    if (lastSync) {
      return `Synced ${formatDistanceToNow(lastSync, { addSuffix: true })}`;
    }
    return "Never synced";
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {getStatusIcon()}
      <span>{getStatusText()}</span>
    </div>
  );
}
