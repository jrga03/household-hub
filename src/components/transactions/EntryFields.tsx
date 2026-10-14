import { useEffect, type RefObject } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isEntryDirection, TRANSFER_TYPE, type EntryDirection } from "@/lib/transactions/filter";
import { cn } from "@/lib/utils";

export const SAVED_LOCALLY = "Saved on this device at once; it reaches others when they sync.";

/** Spans both columns of the entry form's two-column grid. */
export const FULL_ROW = "@[480px]:col-span-2";

/**
 * A new entry starts at its amount, also after switching to or from Transfer.
 * The dialog's own first-field focus runs before the form has loaded its choices.
 */
export function useFocusNewEntry(amount: RefObject<HTMLInputElement | null>, isNew: boolean) {
  useEffect(() => {
    if (isNew) amount.current?.focus();
  }, [amount, isNew]);
}

/** Expense, Income and, for a new entry, Transfer. */
export function DirectionChoice({
  value,
  onChange,
  withTransfer,
}: {
  value: EntryDirection;
  onChange: (direction: EntryDirection) => void;
  withTransfer: boolean;
}) {
  return (
    <RadioGroup
      name="type"
      value={value}
      onValueChange={(next) => isEntryDirection(next) && onChange(next)}
      // Three choices need a row of their own.
      className={cn(
        "grid gap-2 self-end",
        withTransfer ? `grid-cols-3 ${FULL_ROW}` : "grid-cols-2"
      )}
      aria-label={withTransfer ? "Expense, income or transfer" : "Expense or income"}
    >
      <ChoiceItem id="transaction-type-expense" value="expense" label="Expense" />
      <ChoiceItem id="transaction-type-income" value="income" label="Income" />
      {withTransfer && (
        <ChoiceItem id="transaction-type-transfer" value={TRANSFER_TYPE} label="Transfer" />
      )}
    </RadioGroup>
  );
}

export function ChoiceItem({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2">
      <RadioGroupItem id={id} value={value} />
      <Label htmlFor={id} className="flex-1">
        {label}
      </Label>
    </div>
  );
}
