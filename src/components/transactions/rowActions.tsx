import { useTransition } from "react";
import { CircleCheck, CircleDashed, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/app/Button";
import { removeCorrectionWithUndo } from "@/components/corrections/CorrectionDialog";
import type { Actor } from "@/lib/commands/accounts";
import { setTransactionStatus } from "@/lib/commands/transactions";
import { setTransferStatus } from "@/lib/commands/transfers";
import type { TransactionStatus } from "@/lib/transactions/events";
import { isCorrection, isTransfer, statusOf, type ListRow } from "@/lib/transactions/filter";
import { errorMessage } from "@/lib/utils";
import { removeWithUndo } from "./removeWithUndo";
import { removeTransferWithUndo } from "./TransferDialog";

const OTHER_STATUS: Record<TransactionStatus, TransactionStatus> = {
  cleared: "pending",
  pending: "cleared",
};

/**
 * Flips a row between cleared and pending. A balance correction is always
 * cleared, so it has no status to change (`canToggle` is false).
 */
export function useStatusToggle(actor: Actor, row: ListRow) {
  const [changing, startChanging] = useTransition();
  const toggleTo = OTHER_STATUS[statusOf(row)];
  const toggle = (onChanged?: () => void) =>
    startChanging(async () => {
      try {
        if (isCorrection(row)) return;
        if (isTransfer(row)) await setTransferStatus(actor, row.id, toggleTo);
        else await setTransactionStatus(actor, row.id, toggleTo);
        onChanged?.();
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the status."));
      }
    });
  return { canToggle: !isCorrection(row), toggleTo, changing, toggle };
}

/** Asks first, then removes the row with Undo in the toast. Resolves whether it was removed. */
export function removeRow(actor: Actor, row: ListRow, label: string): Promise<boolean> {
  if (isCorrection(row)) return removeCorrectionWithUndo(actor, row);
  if (isTransfer(row)) return removeTransferWithUndo(actor, row, label);
  return removeWithUndo(actor, row);
}

/** A row's quick actions: mark cleared or pending, and remove. */
export function RowQuickActions({
  actor,
  row,
  label,
}: {
  actor: Actor;
  row: ListRow;
  label: string;
}) {
  const { canToggle, toggleTo, changing, toggle } = useStatusToggle(actor, row);
  const StatusIcon = toggleTo === "cleared" ? CircleCheck : CircleDashed;
  return (
    <>
      {canToggle && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Mark ${label} ${toggleTo}`}
          disabled={changing}
          onClick={() => toggle()}
        >
          <StatusIcon aria-hidden="true" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${label}`}
        onClick={() => void removeRow(actor, row, label)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </>
  );
}
