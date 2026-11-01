import { useEffect, type RefObject } from "react";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { Field } from "@/components/app/Field";
import { FULL_ROW } from "@/components/app/FormSheet";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import {
  AMOUNT_PROBLEM,
  isAmount,
  parsePHPSafe,
  PESO_SIGN,
  ZERO_CENTS,
  type Cents,
} from "@/lib/currency";
import { isLocalDate, type TransactionStatus } from "@/lib/transactions/events";
import { TRANSFER_TYPE, type EntryDirection } from "@/lib/transactions/filter";
import { cn } from "@/lib/utils";

/**
 * A new entry starts at its amount, also after switching to or from Transfer.
 * The dialog's own first-field focus runs before the form has loaded its choices.
 */
export function useFocusNewEntry(amount: RefObject<HTMLInputElement | null>, isNew: boolean) {
  useEffect(() => {
    if (isNew) amount.current?.focus();
  }, [amount, isNew]);
}

export type EntryField = "amount" | "date" | "description";

/** What a save left to fix: a message per field, or one for the whole form. */
export interface EntryProblems {
  fields: Partial<Record<EntryField, string>>;
  form: string | null;
}

export const NO_PROBLEMS: EntryProblems = { fields: {}, form: null };

export const formProblem = (message: string): EntryProblems => ({ fields: {}, form: message });

/** The amount and date every entry needs, checked before the command sees them. */
export function readEntryBasics(formData: FormData): {
  amountCents: Cents;
  date: string;
  fields: EntryProblems["fields"];
} {
  const fields: EntryProblems["fields"] = {};
  const parsed = parsePHPSafe(String(formData.get("amount") ?? ""));
  const amountCents = parsed.success ? parsed.value : ZERO_CENTS;
  if (!parsed.success) fields.amount = parsed.error.message;
  else if (!isAmount(amountCents)) fields.amount = AMOUNT_PROBLEM;
  const date = String(formData.get("date") ?? "");
  if (!isLocalDate(date)) fields.date = "Choose a date.";
  return { amountCents, date, fields };
}

export const hasFieldProblems = (fields: EntryProblems["fields"]) => Object.keys(fields).length > 0;

/** The amount typed, kept as cents so it can follow a switch between forms. */
export function AmountField({
  value,
  onChange,
  error,
  inputRef,
  className,
}: {
  value: Cents | undefined;
  onChange: (cents: Cents) => void;
  error?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  return (
    <div className={className}>
      <Field label={`Amount (${PESO_SIGN})`} error={error}>
        <CurrencyInput
          ref={inputRef}
          name="amount"
          placeholder="0.00"
          autoComplete="off"
          enterKeyHint="next"
          required
          value={value}
          onChange={onChange}
        />
      </Field>
    </div>
  );
}

const DIRECTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const satisfies readonly { value: EntryDirection; label: string }[];

const DIRECTIONS_WITH_TRANSFER = [
  ...DIRECTIONS,
  { value: TRANSFER_TYPE, label: "Transfer" },
] as const satisfies readonly { value: EntryDirection; label: string }[];

/** Expense, Income and, for a new entry, Transfer. Inside a form it submits as `type`. */
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
    <div className={cn("self-end", withTransfer && FULL_ROW)}>
      <input type="hidden" name="type" value={value} />
      <SegmentedControl<EntryDirection>
        label={withTransfer ? "Expense, income or transfer" : "Expense or income"}
        options={withTransfer ? DIRECTIONS_WITH_TRANSFER : DIRECTIONS}
        value={value}
        onChange={onChange}
        className={cn("grid w-full", withTransfer ? "grid-cols-3" : "grid-cols-2")}
      />
    </div>
  );
}

export const OUT_OF_POCKET = "out-of-pocket";
/** A status, or Out-of-pocket: pending, paid by the member recording it (ADR 0012). */
export type StatusChoiceValue = TransactionStatus | typeof OUT_OF_POCKET;

const STATUSES = [
  { value: "cleared", label: "Cleared" },
  { value: "pending", label: "Pending" },
] as const satisfies readonly { value: StatusChoiceValue; label: string }[];

const STATUSES_WITH_OUT_OF_POCKET = [
  ...STATUSES,
  { value: OUT_OF_POCKET, label: "Out-of-pocket" },
] as const satisfies readonly { value: StatusChoiceValue; label: string }[];

/**
 * Cleared or Pending, and Out-of-pocket where it's offered, submitted as `status`.
 * `hint` shows a fixed fact under it, such as who paid an out-of-pocket expense.
 */
export function StatusChoice({
  value,
  onChange,
  withOutOfPocket = false,
  hint,
}: {
  value: StatusChoiceValue;
  onChange: (status: StatusChoiceValue) => void;
  withOutOfPocket?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      {/* The control names itself; this is the visible label. */}
      <p className="text-label leading-none" aria-hidden="true">
        Status
      </p>
      <input type="hidden" name="status" value={value} />
      <SegmentedControl<StatusChoiceValue>
        label="Status"
        options={withOutOfPocket ? STATUSES_WITH_OUT_OF_POCKET : STATUSES}
        value={value}
        onChange={onChange}
        className={cn("grid w-full", withOutOfPocket ? "grid-cols-3" : "grid-cols-2")}
      />
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}
