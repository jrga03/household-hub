import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { usePwaPromptStore } from "@/stores/pwaPromptStore";

/**
 * Stable toast id: repeated calls update the single toast in place instead of
 * stacking duplicates, and lets us retract it when the update is dismissed.
 */
const UPDATE_TOAST_ID = "sw-update-available";

/**
 * UpdatePrompt - surfaces "new version available" as a persistent sonner toast
 *
 * Renders null; all UI goes through the shared Toaster (which already handles
 * mobile offsets and safe areas, review R7). Behavior:
 * - Fires ONE persistent toast (duration: Infinity) per waiting service
 *   worker: the effect is keyed on `needRefresh`, not on renders, and the
 *   fixed toast id de-duplicates re-mounts.
 * - "Reload" action runs the existing update/reload logic from
 *   useServiceWorker (skipWaiting + controllerchange + reload).
 * - Close button / dismissal clears the service worker's needRefresh flag.
 * - Applies the update when the app goes to the background, unless a dialog
 *   or an Assistant draft is open; it checks again on the next background.
 * - Mirrors the pending state into pwaPromptStore so PWAInstallPrompt can
 *   suppress its install card while an update is waiting.
 */
export function UpdatePrompt() {
  const { needRefresh, update, dismiss } = useServiceWorker();
  const setUpdatePending = usePwaPromptStore((state) => state.setUpdatePending);

  // update/dismiss are re-created by useServiceWorker on every render; hold
  // the latest in refs (synced in a dep-less effect, per react-hooks/refs) so
  // the toast effect depends only on needRefresh and cannot re-fire per render.
  const updateRef = useRef(update);
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    updateRef.current = update;
    dismissRef.current = dismiss;
  });

  // update() reloads only after a wait; a second call in that wait would queue a second reload.
  const updateStartedRef = useRef(false);
  const startUpdate = useCallback(() => {
    if (updateStartedRef.current) return;
    updateStartedRef.current = true;
    void updateRef.current();
  }, []);

  useEffect(() => {
    setUpdatePending(needRefresh);

    if (!needRefresh) {
      // Waiting SW gone (update applied or dismissed elsewhere): retract the
      // toast if it is still visible.
      toast.dismiss(UPDATE_TOAST_ID);
      return;
    }

    toast("Update available", {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      closeButton: true,
      description: "A new version of Household Hub is ready.",
      action: {
        label: "Reload",
        onClick: startUpdate,
      },
      onDismiss: () => {
        dismissRef.current();
      },
    });
  }, [needRefresh, setUpdatePending, startUpdate]);

  useEffect(() => {
    if (!needRefresh) return;

    const applyInBackground = () => {
      if (document.visibilityState !== "hidden") return;
      const dialogOpen = document.querySelector('[role="dialog"]') !== null;
      if (!dialogOpen && !usePwaPromptStore.getState().assistantDraftPending) startUpdate();
    };
    document.addEventListener("visibilitychange", applyInBackground);
    return () => document.removeEventListener("visibilitychange", applyInBackground);
  }, [needRefresh, startUpdate]);

  return null;
}
