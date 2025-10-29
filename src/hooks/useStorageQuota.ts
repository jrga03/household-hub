import { useState, useEffect } from "react";

/**
 * Storage quota information returned by the hook
 */
interface StorageQuota {
  /** Storage used in bytes */
  usage: number;
  /** Total storage quota in bytes */
  quota: number;
  /** Percentage of quota used (0-100) */
  percentage: number;
  /** Whether storage is available (percentage < 95%) */
  available: boolean;
}

/**
 * Hook to monitor browser storage quota and usage
 *
 * Checks storage usage on mount and every 5 minutes thereafter.
 * Critical threshold is 95% - consider warning users at 80%.
 *
 * @returns StorageQuota object or null if Storage API not available
 *
 * @example
 * ```typescript
 * const quota = useStorageQuota();
 * if (quota && quota.percentage > 80) {
 *   // Show warning to user
 *   console.warn(`Storage at ${quota.percentage}%`);
 * }
 * ```
 */
export function useStorageQuota() {
  const [quota, setQuota] = useState<StorageQuota | null>(null);

  useEffect(() => {
    const checkQuota = async () => {
      if (!navigator.storage?.estimate) {
        return null;
      }

      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      setQuota({
        usage,
        quota,
        percentage,
        available: percentage < 95, // Critical at 95%
      });
    };

    checkQuota();

    // Check every 5 minutes
    const interval = setInterval(checkQuota, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return quota;
}
