import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

export interface UndoableChange {
  change: () => Promise<void>;
  /** Appends the event that reverses the change. */
  undo: () => Promise<void>;
  /** The toast once made: "Removed Lunch". */
  done: string;
  /** The fallback toast when the change is refused: "Couldn't remove the transfer." */
  failed: string;
  undoFailed: string;
}

/** Makes the change, offering Undo in the toast. Resolves whether it was made. */
export async function changeWithUndo({
  change,
  undo,
  done,
  failed,
  undoFailed,
}: UndoableChange): Promise<boolean> {
  try {
    await change();
  } catch (caught) {
    toast.error(errorMessage(caught, failed));
    return false;
  }
  toast.success(done, {
    action: {
      label: "Undo",
      onClick: () =>
        void undo().catch((caught: unknown) => toast.error(errorMessage(caught, undoFailed))),
    },
  });
  return true;
}

/** Deletes a retired record; one with history isn't deleted, and the toast says why. */
export async function deleteWithUndo(
  name: string,
  remove: () => Promise<void>,
  restore: () => Promise<void>
): Promise<void> {
  await changeWithUndo({
    change: remove,
    undo: restore,
    done: `Deleted ${name}`,
    failed: `Couldn't delete ${name}.`,
    undoFailed: `Couldn't restore ${name}.`,
  });
}
