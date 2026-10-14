import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/FormSheet";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { categoryNames } from "@/components/allocations/envelopes";
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
import { todayLocalDate } from "@/lib/utils/dates";

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

  const [error, saveAction] = useActionState(async (_previous: string | null) => {
    const actual = parseSignedPHPSafe(actualText);
    if (!actual.success) return actual.error.message;
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
      return null;
    } catch (caught) {
      return errorMessage(caught, `Couldn't correct ${account.name}.`);
    }
  }, null);

  if (!categories) return null;
  const choices = categoryChoices(categories, account, null);
  const envelopeName =
    categoryValue === UNASSIGNED
      ? "Unassigned"
      : (categoryNames(categories).get(categoryValue) ?? "the category");
  const actual = parseSignedPHPSafe(actualText);

  return (
    <ActionForm
      ref={advanceOnEnter}
      action={saveAction}
      className="space-y-4"
      aria-label={`Correct ${account.name}`}
    >
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="correction-actual">
            {card ? "Amount owed" : "Actual balance"} ({PESO_SIGN})
          </Label>
          <Input
            id="correction-actual"
            name="actual"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="done"
            required
            value={actualText}
            onChange={(event) => setActualText(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="correction-date">Date</Label>
          <Input
            id="correction-date"
            name="date"
            type="date"
            required
            max={todayLocalDate()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="space-y-2 @[480px]:col-span-2">
          <Label htmlFor="correction-category">Category</Label>
          <CategorySelect
            id="correction-category"
            choices={choices}
            value={categoryValue}
            onValueChange={setCategoryValue}
          />
        </div>
      </div>

      {cleared !== undefined && cleared !== null && (
        <div className="space-y-1 text-sm" aria-live="polite">
          <p className="text-muted-foreground">
            {card ? "Cleared amount owed" : "Cleared balance"} at the end of that day:{" "}
            <span className="tabular-nums">{formatPHP(cleared)}</span>
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

      <FormError>{error}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Saving...">Correct balance</SubmitButton>
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
  const amount = formatPHP(absCents(difference));
  const sign = difference > 0 ? "+" : "−";
  const effect = card
    ? difference > 0
      ? `${envelopeName} sets aside ${amount} more for the card.`
      : `${amount} set aside for the card goes back to ${envelopeName}.`
    : difference > 0
      ? `${amount} is added to ${envelopeName}.`
      : `${amount} is taken from ${envelopeName}.`;
  return (
    <p>
      Difference: <span className="font-medium tabular-nums">{`${sign}${amount}`}</span>. {effect}
    </p>
  );
}
