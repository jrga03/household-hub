/**
 * Discard-confirmation used by dirty-form navigation guards (useBlocker in
 * TransactionFormDialog).
 *
 * Kept as a swappable indirection so Phase 5.4 (window.confirm → AlertDialog,
 * review R39) can replace the implementation in ONE place — `setConfirmDiscardImpl`
 * accepts an async implementation, which is what an AlertDialog flow returns.
 */

type ConfirmFn = (message: string) => boolean | Promise<boolean>;

export const DISCARD_UNSAVED_MESSAGE = "Discard unsaved changes?";

let confirmImpl: ConfirmFn = (message) => window.confirm(message);

/** Resolves true when the user agrees to discard their unsaved changes. */
export function confirmDiscardChanges(
  message: string = DISCARD_UNSAVED_MESSAGE
): boolean | Promise<boolean> {
  return confirmImpl(message);
}

/** Swap the confirm UI (Phase 5.4 AlertDialog, or a test double). */
export function setConfirmDiscardImpl(impl: ConfirmFn): void {
  confirmImpl = impl;
}
