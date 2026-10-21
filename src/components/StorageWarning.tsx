import { useStorageQuota } from "@/hooks/useStorageQuota";
import { Notice } from "@/components/app/Notice";

const WARN_FROM_PERCENT = 80;
const ALMOST_FULL_PERCENT = 95;
const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * Warns once this device's storage passes 80% of its quota. AppLayout's
 * BannerStack positions it, so banners stack instead of overpainting (review R29).
 */
export function StorageWarning() {
  const quota = useStorageQuota();

  if (!quota || quota.percentage < WARN_FROM_PERCENT) {
    return null;
  }

  const almostFull = quota.percentage > ALMOST_FULL_PERCENT;

  return (
    <div className="mx-auto w-full max-w-7xl px-4">
      <Notice
        tone="warning"
        title={almostFull ? "Storage is almost full" : "Storage is running low"}
        className="pointer-events-auto shadow-float"
      >
        Using {toMB(quota.usage)} MB of {toMB(quota.quota)} MB ({Math.round(quota.percentage)}%).
        {almostFull && " Export your data or remove old records to free space."}
      </Notice>
    </div>
  );
}
