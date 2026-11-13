import { useEffect, useId, type RefObject } from "react";
import { toast } from "sonner";
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
import { MOVE_DIRECTION, type EntryDirection } from "@/lib/transactions/filter";
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

const DIRECTIONS_WITH_MOVE = [
  ...DIRECTIONS,
  { value: MOVE_DIRECTION, label: "Move money" },
] as const satisfies readonly { value: EntryDirection; label: string }[];

/** Expense, Income and, for a new entry, Move money. Inside a form it submits as `type`. */
export function DirectionChoice({
  value,
  onChange,
  withMove,
}: {
  value: EntryDirection;
  onChange: (direction: EntryDirection) => void;
  withMove: boolean;
}) {
  return (
    <div className={cn("self-end", withMove && FULL_ROW)}>
      <input type="hidden" name="type" value={value} />
      <SegmentedControl<EntryDirection>
        label={withMove ? "Expense, income or move money" : "Expense or income"}
        options={withMove ? DIRECTIONS_WITH_MOVE : DIRECTIONS}
        value={value}
        onChange={onChange}
        className={cn("grid w-full", withMove ? "grid-cols-3" : "grid-cols-2")}
      />
    </div>
  );
}

/** Saves an edit, then its status apart from it; says so only when something changed. */
export async function saveEditAndStatus({
  edit,
  status,
  previousStatus,
  setStatus,
  saved,
}: {
  edit: () => Promise<boolean>;
  status: TransactionStatus;
  previousStatus: TransactionStatus;
  setStatus: (status: TransactionStatus) => Promise<unknown>;
  saved: string;
}): Promise<void> {
  const edited = await edit();
  const statusChanged = status !== previousStatus;
  if (statusChanged) await setStatus(status);
  if (edited || statusChanged) toast.success(saved);
}

export const STATUSES = [
  { value: "cleared", label: "Cleared" },
  { value: "pending", label: "Pending" },
] as const satisfies readonly { value: TransactionStatus; label: string }[];

/**
 * One of `options`, submitted as `status`; Cleared or Pending unless a form adds more.
 * `hint` shows a fixed fact under it, such as who paid an out-of-pocket expense.
 */
export function StatusChoice<Status extends string>({
  value,
  onChange,
  options,
  hint,
}: {
  value: Status;
  onChange: (status: Status) => void;
  options: readonly { value: Status; label: string }[];
  hint?: string;
}) {
  const hintId = useId();
  return (
    <div className="space-y-2">
      {/* The control names itself; this is the visible label. */}
      <p className="text-label leading-none" aria-hidden="true">
        Status
      </p>
      <input type="hidden" name="status" value={value} />
      <SegmentedControl<Status>
        label="Status"
        options={options}
        value={value}
        onChange={onChange}
        className={cn("grid w-full", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}
        aria-describedby={hint && hintId}
      />
      {hint && (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
