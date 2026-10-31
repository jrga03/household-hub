import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { FormFooter, FormSheet, FULL_ROW } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import { Money } from "@/components/app/Money";
import { SubmitButton } from "@/components/app/SubmitButton";
import { categoryNames } from "@/components/allocations/envelopes";
import {
  NO_PROBLEMS,
  useFocusNewEntry,
  type EntryProblems,
} from "@/components/transactions/EntryFields";
import {
  categoryChoices,
  CategorySelect,
  UNASSIGNED,
} from "@/components/transactions/CategorySelect";
import { useCategoryList } from "@/hooks/useCategories";
import { useClearedBalanceAt } from "@/hooks/useTransactions";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import type { Actor } from "@/lib/commands/accounts";
import { recordBalanceCorrection } from "@/lib/commands/corrections";
import type { CorrectionEnvelope } from "@/lib/corrections/events";
import {
  absCents,
  diffCents,
  formatPHP,
  parseSignedPHPSafe,
  PESO_SIGN,
  type Cents,
} from "@/lib/currency";
import { errorMessage } from "@/lib/utils";
import { isLocalDate } from "@/lib/transactions/events";
import { todayLocalDate } from "@/lib/utils/dates";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";

const envelopeOf = (value: string): CorrectionEnvelope =>
  value === UNASSIGNED ? { kind: "unassigned" } : { kind: "category", id: value };

/**
 * Records the difference between the account's cleared balance and the one
 * the bank shows, instead of rewriting the starting balance (ADR 0009).
 */
export function CorrectBalanceDialog({
  actor,
  account,
  onClose,
}: {
  actor: Actor;
  account: AccountRow;
  onClose: () => void;
}) {
  const card = isCreditCard(account);
  return (
    <FormSheet
      title={`Correct ${account.name}`}
      description={
        card
          ? "Enter what the card owes, as the bank shows it. The difference is recorded as a correction."
          : "Enter the balance the bank shows. The difference is recorded as a correction."
      }
      onClose={onClose}
    >
      <CorrectBalanceForm actor={actor} account={account} onClose={onClose} />
    </FormSheet>
  );
}

function CorrectBalanceForm({
  actor,
  account,
  onClose,
}: {
  actor: Actor;
  account: AccountRow;
  onClose: () => void;
}) {
  const categories = useCategoryList();
  const [actualText, setActualText] = useState("");
  const [date, setDate] = useState(todayLocalDate);
  const [categoryValue, setCategoryValue] = useState(UNASSIGNED);
  const cleared = useClearedBalanceAt(account.id, date);
  const card = isCreditCard(account);

  const [problems, saveAction] = useActionState(
    async (_previous: EntryProblems): Promise<EntryProblems> => {
      const actual = parseSignedPHPSafe(actualText);
      const dateProblem = isLocalDate(date) ? undefined : "Choose a date.";
      if (!actual.success || dateProblem) {
        // The actual balance sits where an entry's amount does.
        const fields: EntryProblems["fields"] = { date: dateProblem };
        if (!actual.success) fields.amount = actual.error.message;
        return { fields, form: null };
      }
      try {
        const recorded = await recordBalanceCorrection(actor, {
          accountId: account.id,
          date,
          actualBalanceCents: actual.value,
          envelope: envelopeOf(categoryValue),
        });
        if (recorded) toast.success(`${account.name} corrected to ${formatPHP(actual.value)}`);
        else toast.info(`${account.name} already matches ${formatPHP(actual.value)}.`);
        onClose();
        return NO_PROBLEMS;
      } catch (caught) {
        return { fields: {}, form: errorMessage(caught, `Couldn't correct ${account.name}.`) };
      }
    },
    NO_PROBLEMS
  );
  const formRef = useFocusFirstProblem(problems);
  const amountRef = useRef<HTMLInputElement>(null);
  // Focus waits for the categories, which the form needs before it renders.
  useFocusNewEntry(amountRef, categories !== undefined);

  if (!categories) return null;
  const choices = categoryChoices(categories, account, null);
  const envelopeName =
    categoryValue === UNASSIGNED
      ? "Unassigned"
      : (categoryNames(categories).get(categoryValue) ?? "the category");
  const actual = parseSignedPHPSafe(actualText);

  return (
    <ActionForm
      ref={formRef}
      action={saveAction}
      noValidate
      className="space-y-4"
      aria-label={`Correct ${account.name}`}
    >
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <Field
          label={`${card ? "Amount owed" : "Actual balance"} (${PESO_SIGN})`}
          hint={card ? undefined : "Start with a minus sign for a negative balance."}
          error={problems.fields.amount}
        >
          <Input
            ref={amountRef}
            name="actual"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="done"
            required
            value={actualText}
            onChange={(event) => setActualText(event.target.value)}
          />
        </Field>
        <Field label="Date" error={problems.fields.date}>
          <Input
            name="date"
            type="date"
            required
            max={todayLocalDate()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <div className={FULL_ROW}>
          <Field label="Category (optional)">
            {(control) => (
              <CategorySelect
                {...control}
                choices={choices}
                value={categoryValue}
                onValueChange={setCategoryValue}
              />
            )}
          </Field>
        </div>
      </div>

      {cleared !== undefined && cleared !== null && (
        <div className="space-y-1 text-body" aria-live="polite">
          <p className="text-muted-foreground">
            {card ? "Cleared amount owed" : "Cleared balance"} at the end of that day:{" "}
            <Money kind="balance" owed={card} cents={cleared} />
          </p>
          {actualText.trim() !== "" && actual.success && (
            <DifferenceNote
              difference={diffCents(actual.value, cleared)}
              card={card}
              envelopeName={envelopeName}
            />
          )}
        </div>
      )}

      <FormError>{problems.form}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Saving…">Correct balance</SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}

/** The signed difference and where it lands, before anything is saved. */
function DifferenceNote({
  difference,
  card,
  envelopeName,
}: {
  difference: Cents;
  card: boolean;
  envelopeName: string;
}) {
  if (difference === 0) return <p>Already matches. Nothing will be recorded.</p>;
  const amount = <Money kind="balance" cents={absCents(difference)} />;
  const effect = card ? (
    difference > 0 ? (
      <>
        {envelopeName} sets aside {amount} more for the card.
      </>
    ) : (
      <>
        {amount} set aside for the card goes back to {envelopeName}.
      </>
    )
  ) : difference > 0 ? (
    <>
      {amount} is added to {envelopeName}.
    </>
  ) : (
    <>
      {amount} is taken from {envelopeName}.
    </>
  );
  return (
    <p>
      Difference:{" "}
      {card ? (
        // More owed is not income: a card's change keeps a neutral sign.
        <Money
          kind="transfer"
          leg={difference > 0 ? "in" : "out"}
          cents={absCents(difference)}
          className="font-medium"
        />
      ) : (
        <Money kind="net" cents={difference} className="font-medium" />
      )}
      . {effect}
    </p>
  );
}
