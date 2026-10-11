/**
 * When the device syncs: app start, reconnect, the page becoming visible, after
 * local writes, and after a failure, with a delay that doubles each time.
 */

type Sync = () => Promise<void>;

let onLocalWrite: (() => void) | null = null;

/** Commands call this after appending; a burst of writes syncs once. */
export function requestSync(): void {
  onLocalWrite?.();
}

export function startSyncTriggers(
  sync: Sync,
  {
    debounceMs = 1000,
    retryBaseMs = 2000,
    retryMaxMs = 5 * 60_000,
    onError = (_error: unknown) => {},
  } = {}
): () => void {
  let stopped = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const runSync = () => {
    clearTimeout(retryTimer);
    sync().then(
      () => {
        failures = 0;
      },
      (error: unknown) => {
        onError(error);
        if (stopped) return;
        const delay = Math.min(retryBaseMs * 2 ** failures, retryMaxMs);
        failures += 1;
        retryTimer = setTimeout(runSync, delay);
      }
    );
  };
  const runWhenVisible = () => {
    if (document.visibilityState === "visible") runSync();
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  onLocalWrite = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSync, debounceMs);
  };

  window.addEventListener("online", runSync);
  document.addEventListener("visibilitychange", runWhenVisible);
  runSync();

  return () => {
    stopped = true;
    onLocalWrite = null;
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    window.removeEventListener("online", runSync);
    document.removeEventListener("visibilitychange", runWhenVisible);
  };
}
