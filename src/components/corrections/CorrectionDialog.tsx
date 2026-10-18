import { format } from "date-fns";
import { toast } from "sonner";
import { FormFooter, FormSheet } from "@/components/FormSheet";
import { categoryNames } from "@/components/allocations/envelopes";
import { useAccountNames } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { envelopeLabel } from "@/lib/allocations/envelope";
import type { Actor } from "@/lib/commands/accounts";
import { removeBalanceCorrection, restoreBalanceCorrection } from "@/lib/commands/corrections";
import { CORRECTION_LABEL, isMoneyIn } from "@/lib/corrections/events";
import type { BalanceCorrectionRow } from "@/lib/corrections/projection";
import { errorMessage } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { confirmRemoval } from "@/components/transactions/confirmRemoval";
import { TransactionAmount } from "@/components/transactions/TransactionAmount";

/** Asks first, then removes the correction, offering Undo in the toast. Resolves whether it was removed. */
export async function removeCorrectionWithUndo(
  actor: Actor,
  correction: BalanceCorrectionRow
): Promise<boolean> {
  if (!(await confirmRemoval(CORRECTION_LABEL, correction.amountCents))) return false;
  try {
    await removeBalanceCorrection(actor, correction.id);
  } catch (caught) {
    toast.error(errorMessage(caught, "Couldn't remove the correction."));
    return false;
  }
  toast.success("Removed the balance correction", {
    action: {
      label: "Undo",
      onClick: () =>
        void restoreBalanceCorrection(actor, correction.id).catch((caught: unknown) =>
          toast.error(errorMessage(caught, "Couldn't restore the correction."))
        ),
    },
  });
  return true;
}

export function CorrectionDialog({
  actor,
  correction,
  onClose,
}: {
  actor: Actor;
  correction: BalanceCorrectionRow;
  onClose: () => void;
}) {
  return (
    <FormSheet title={CORRECTION_LABEL} onClose={onClose}>
      <CorrectionDetails actor={actor} correction={correction} onClose={onClose} />
    </FormSheet>
  );
}

/** What the correction recorded, for the dialog and the wide-screen detail pane. It is never edited (ADR 0009). */
export function CorrectionDetails({
  actor,
  correction,
  onClose,
}: {
  actor: Actor;
  correction: BalanceCorrectionRow;
  onClose: () => void;
}) {
  const accountNames = useAccountNames();
  const categories = useCategoryList();
  if (!accountNames || !categories) return null;
  const accountName = accountNames.get(correction.accountId) ?? "Account not on this device yet";
  const envelope = envelopeLabel(correction.envelope, categoryNames(categories), accountNames);

  const remove = async () => {
    if (await removeCorrectionWithUndo(actor, correction)) onClose();
  };

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
        <dt className="text-muted-foreground">Account</dt>
        <dd>{accountName}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{format(parseLocalDate(correction.date), "MMM d, yyyy")}</dd>
        <dt className="text-muted-foreground">Difference</dt>
        <dd className="tabular-nums">
          <TransactionAmount
            direction={isMoneyIn(correction) ? "in" : "out"}
            cents={correction.amountCents}
          />
        </dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{envelope}</dd>
      </dl>
      <p className="text-body text-muted-foreground">
        A correction can&apos;t be edited. If it&apos;s wrong, remove it and correct the balance
        again.
      </p>
      <FormFooter destructive={{ label: "Remove correction", onClick: () => void remove() }}>
        {null}
      </FormFooter>
    </div>
  );
}
