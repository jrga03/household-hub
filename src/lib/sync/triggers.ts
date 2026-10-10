/** When the device syncs: app start, reconnect, the page becoming visible, and after local writes. */

type Sync = () => Promise<void>;

let onLocalWrite: (() => void) | null = null;

/** Commands call this after appending; a burst of writes syncs once. */
export function requestSync(): void {
  onLocalWrite?.();
}

export function startSyncTriggers(
  sync: Sync,
  { debounceMs = 1000, onError = (_error: unknown) => {} } = {}
): () => void {
  const runSync = () => {
    sync().catch(onError);
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
    onLocalWrite = null;
    clearTimeout(debounceTimer);
    window.removeEventListener("online", runSync);
    document.removeEventListener("visibilitychange", runWhenVisible);
  };
}
