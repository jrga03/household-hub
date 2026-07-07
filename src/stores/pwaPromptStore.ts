/**
 * Zustand Store for PWA prompt coordination (mobile UX review R7)
 *
 * UpdatePrompt (service-worker update toast) and PWAInstallPrompt (install
 * card) used to render at the identical fixed bottom position and overlapped
 * 100% when both were pending. UpdatePrompt is now a persistent sonner toast,
 * and this store is the coordination channel between the two:
 *
 * - UpdatePrompt writes `updatePending` whenever the service worker's
 *   `needRefresh` flag changes (a new SW is waiting).
 * - PWAInstallPrompt reads `updatePending` and suppresses its card while an
 *   update is pending. The suppression is render-only: the install prompt's
 *   own timers and dismissal bookkeeping (iOS 3s delay, 7-day re-prompt)
 *   keep running, so the card appears on its normal schedule once the update
 *   is applied or dismissed.
 *
 * A zustand store (rather than a plain module variable) is used because the
 * two components live in different trees (App.tsx vs AppLayout) and the
 * install prompt must re-render reactively when the flag flips.
 *
 * @module stores/pwaPromptStore
 */

import { create } from "zustand";

interface PwaPromptStore {
  /** True while a new service worker is waiting (update toast is showing) */
  updatePending: boolean;

  /** Set by UpdatePrompt when the service worker's needRefresh flag changes */
  setUpdatePending: (updatePending: boolean) => void;
}

export const usePwaPromptStore = create<PwaPromptStore>((set) => ({
  updatePending: false,
  setUpdatePending: (updatePending) => set({ updatePending }),
}));
