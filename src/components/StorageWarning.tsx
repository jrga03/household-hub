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
 */
export function StorageWarning() {
  const quota = useStorageQuota();

  if (!quota || quota.percentage < 80) {
    return null;
  }

  const usedMB = (quota.usage / 1024 / 1024).toFixed(1);
  const totalMB = (quota.quota / 1024 / 1024).toFixed(1);

  return (
    <Alert variant={quota.percentage > 95 ? "destructive" : "default"}>
      <HardDrive className="h-4 w-4" />
      <AlertTitle>Storage {quota.percentage > 95 ? "Critical" : "Warning"}</AlertTitle>
      <AlertDescription>
        Using {usedMB}MB of {totalMB}MB ({quota.percentage.toFixed(1)}%)
        {quota.percentage > 95 && " - Please export or delete old data."}
      </AlertDescription>
    </Alert>
  );
}
