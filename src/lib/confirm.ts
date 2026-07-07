/**
 * Imperative confirm() backed by an app-level AlertDialog (review R39).
 *
 * Mirrors sonner's `toast()` pattern: any module — React or not (e.g. the
 * shared delete flow in `lib/delete-transaction.ts`) — calls
 * `await confirm({...})` and gets a boolean back. The single
 * `<ConfirmDialogHost />` (mounted once in AuthProvider) renders whatever
 * request is pending in this store.
 *
 * Outcomes: the dialog settles as "confirm" (action button), "cancel"
 * (explicit cancel button), or "dismiss" (Escape / closed without choosing).
 * The boolean `confirm()` API folds cancel+dismiss into `false`; call sites
 * where dismissal must NOT mean the cancel action (e.g. sign-out, where
 * Escape has to mean "stay signed in", not "sign out without export") use
 * `confirmWithOutcome()` to receive the raw outcome instead.
 *
 * In unit tests, mock this module (`vi.mock("@/lib/confirm")`) instead of
 * mounting the host.
 */

import { create } from "zustand";

export type ConfirmOutcome = "confirm" | "cancel" | "dismiss";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** @default "Confirm" */
  confirmLabel?: string;
  /** @default "Cancel" */
  cancelLabel?: string;
  /** Styles the confirm button as destructive (deletes, discards) */
  destructive?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (outcome: ConfirmOutcome) => void;
}

interface ConfirmState {
  request: ConfirmRequest | null;
  /**
   * Resolves the pending request and closes the dialog. Idempotent: the
   * host's onOpenChange(false) also lands here after an action click, but by
   * then the request has already been cleared.
   */
  settle: (outcome: ConfirmOutcome) => void;
}

let nextRequestId = 0;

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  settle: (outcome) => {
    const current = get().request;
    if (!current) return;
    set({ request: null });
    current.resolve(outcome);
  },
}));

/**
 * Ask the user to confirm an action via the app-level AlertDialog, resolving
 * the raw outcome so Escape/close ("dismiss") can be handled differently
 * from the explicit cancel button.
 */
export function confirmWithOutcome(options: ConfirmOptions): Promise<ConfirmOutcome> {
  return new Promise<ConfirmOutcome>((resolve) => {
    // A new request while one is open dismisses the old one so its caller
    // never hangs on an orphaned promise (should not happen in practice).
    // "dismiss" — not "cancel" — because nobody chose the cancel action.
    useConfirmStore.getState().request?.resolve("dismiss");
    useConfirmStore.setState({ request: { ...options, id: nextRequestId++, resolve } });
  });
}

/**
 * Ask the user to confirm an action via the app-level AlertDialog.
 *
 * @returns true when the user confirms, false when they cancel or dismiss
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  return (await confirmWithOutcome(options)) === "confirm";
}
