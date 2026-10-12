import { toast } from "sonner";
import type { Actor } from "@/lib/commands/accounts";
import { removeAllocation, restoreAllocation } from "@/lib/commands/allocations";
import type { AllocationRow } from "@/lib/allocations/projection";
import { formatPHP } from "@/lib/currency";
import { errorMessage } from "@/lib/utils";

/** Removes the allocation, offering Undo (a restore event) in the toast. */
export async function removeAllocationWithUndo(
  actor: Actor,
  allocation: AllocationRow
): Promise<void> {
  try {
    await removeAllocation(actor, allocation.id);
  } catch (caught) {
    toast.error(errorMessage(caught, "Couldn't remove the move."));
    return;
  }
  toast.success(`Removed the ${formatPHP(allocation.amountCents)} move`, {
    action: {
      label: "Undo",
      onClick: () =>
        void restoreAllocation(actor, allocation.id).catch((caught: unknown) =>
          toast.error(errorMessage(caught, "Couldn't restore the move."))
        ),
    },
  });
}
