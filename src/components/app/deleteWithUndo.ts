import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

/**
 * Deletes a retired record, offering Undo (a restore event) in the toast. A
 * record with history isn't deleted; the toast says why.
 */
export async function deleteWithUndo(
  name: string,
  remove: () => Promise<void>,
  restore: () => Promise<void>
): Promise<void> {
  try {
    await remove();
  } catch (caught) {
    toast.error(errorMessage(caught, `Couldn't delete ${name}.`));
    return;
  }
  toast.success(`Deleted ${name}`, {
    action: {
      label: "Undo",
      onClick: () =>
        void restore().catch((caught: unknown) =>
          toast.error(errorMessage(caught, `Couldn't restore ${name}.`))
        ),
    },
  });
}
