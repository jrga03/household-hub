import { useStorageQuota } from "@/hooks/useStorageQuota";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HardDrive } from "lucide-react";

/**
 * StorageWarning component displays an alert when storage quota exceeds thresholds
 *
 * Thresholds:
 * - 80-95%: Warning (yellow/warning variant)
 * - >95%: Critical (red/destructive variant)
 *
 * Only visible when storage usage exceeds 80%
 *
 * Positioning is owned by AppLayout's BannerStack (shared fixed container
 * with OfflineBanner) so simultaneous banners stack instead of overpainting
 * each other (review R29).
 */
export function StorageWarning() {
  const quota = useStorageQuota();

  if (!quota || quota.percentage < 80) {
    return null;
  }

  const usedMB = (quota.usage / 1024 / 1024).toFixed(1);
  const totalMB = (quota.quota / 1024 / 1024).toFixed(1);

  return (
    <div className="mx-auto w-full max-w-7xl px-4">
      <Alert
        variant={quota.percentage > 95 ? "destructive" : "default"}
        className="pointer-events-auto shadow-lg"
      >
        <HardDrive className="h-4 w-4" />
        <AlertTitle>Storage {quota.percentage > 95 ? "Critical" : "Warning"}</AlertTitle>
        <AlertDescription>
          Using {usedMB}MB of {totalMB}MB ({quota.percentage.toFixed(1)}%)
          {quota.percentage > 95 && " - Please export or delete old data."}
        </AlertDescription>
      </Alert>
    </div>
  );
}
