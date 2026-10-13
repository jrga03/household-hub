import { useActionState, useState } from "react";
import { toast } from "sonner";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/FormSheet";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccounts } from "@/hooks/useAccounts";
import { useBudgets } from "@/hooks/useBudgets";
import { budgetInForce } from "@/lib/budgets/inForce";
import { canFundBudget } from "@/lib/budgets/projection";
import type { CategoryRow } from "@/lib/categories/projection";
import type { BudgetRow } from "@/lib/budgets/projection";
import type { Actor } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { formatPHPInput, parsePHPSafe, PESO_SIGN } from "@/lib/currency";
import { VISIBILITY_LABELS } from "@/lib/events/log";
import { errorMessage } from "@/lib/utils";
import { monthLabel, shiftMonth } from "@/lib/utils/dates";

/** How far either side of the chosen month a budget can be set from. */
const MONTHS_AROUND = 12;

/** Sets the category's budget from a month on; the amount and account start from the one in force then. */
export function SetBudgetDialog({
  actor,
  category,
  month,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const budgets = useBudgets();
  if (!accounts || !budgets) return null;
  const fundingChoices = accounts.filter((account) => canFundBudget(account, category));

  return (
    <FormSheet
      title={`Budget for ${category.name}`}
      description="A monthly target. It stands from the month you choose until a later month changes it."
      onClose={onClose}
    >
      <SetBudgetForm
        actor={actor}
        category={category}
        month={month}
        budgets={budgets}
        fundingChoices={fundingChoices}
        onClose={onClose}
      />
    </FormSheet>
  );
}

function SetBudgetForm({
  actor,
  category,
  month,
  budgets,
  fundingChoices,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  budgets: BudgetRow[];
  fundingChoices: { id: string; name: string }[];
  onClose: () => void;
}) {
  const inForceFrom = (from: string) => budgetInForce(budgets, category.id, from);
  const accountFor = (from: string) => {
    const funding = inForceFrom(from)?.accountId;
    return fundingChoices.some((account) => account.id === funding)
      ? (funding ?? "")
      : (fundingChoices[0]?.id ?? "");
  };
  const amountFor = (from: string) => {
    const budget = inForceFrom(from);
    return budget ? formatPHPInput(budget.amountCents) : "";
  };
  const [fromMonth, setFromMonth] = useState(month);
  const [accountId, setAccountId] = useState(() => accountFor(month));
  const [amountText, setAmountText] = useState(() => amountFor(month));
  const budget = inForceFrom(fromMonth);
  // A retired or no longer fitting funding account isn't a choice; say so rather than switch silently.
  const fundingGone =
    budget !== null && !fundingChoices.some((account) => account.id === budget.accountId);

  const chooseFromMonth = (from: string) => {
    setFromMonth(from);
    setAccountId(accountFor(from));
    setAmountText(amountFor(from));
  };
  const months = Array.from({ length: MONTHS_AROUND * 2 + 1 }, (_, index) =>
    shiftMonth(month, index - MONTHS_AROUND)
  );

  const [error, saveAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const parsed = parsePHPSafe(String(formData.get("amount") ?? ""));
      if (!parsed.success) return parsed.error.message;
      const clearing = parsed.value === 0;
      try {
        await setBudget(actor, {
          categoryId: category.id,
          fromMonth,
          amountCents: parsed.value,
          accountId: clearing || accountId === "" ? null : accountId,
        });
        toast.success(clearing ? "Budget cleared" : "Budget set");
        onClose();
        return null;
      } catch (caught) {
        return errorMessage(caught, "Couldn't set the budget.");
      }
    },
    null
  );

  return (
    <form
      ref={advanceOnEnter}
      action={saveAction}
      className="space-y-4"
      aria-label={`Budget for ${category.name}`}
    >
      <div className="grid gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="budget-amount">Amount ({PESO_SIGN})</Label>
          <Input
            id="budget-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="done"
            required
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            aria-describedby="budget-amount-hint"
          />
          <p id="budget-amount-hint" className="text-xs text-muted-foreground">
            0 clears it from that month.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget-from">From</Label>
          <Select value={fromMonth} onValueChange={chooseFromMonth}>
            <SelectTrigger id="budget-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((choice) => (
                <SelectItem key={choice} value={choice}>
                  {monthLabel(choice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 @[480px]:col-span-2">
          <Label htmlFor="budget-account">Funding account</Label>
          {fundingChoices.length === 0 ? (
            <p id="budget-account" className="text-sm text-muted-foreground">
              Add a {VISIBILITY_LABELS[category.visibility]} bank, cash or e-wallet account on Home
              first.
            </p>
          ) : (
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="budget-account" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fundingChoices.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fundingGone && (
            <p className="text-xs text-destructive">
              Its funding account is retired or no longer fits. Choose another.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Where this budget&apos;s money goes when you distribute a payday.
          </p>
        </div>
      </div>

      <FormError>{error}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Saving...">Save budget</SubmitButton>
      </FormFooter>
    </form>
  );
}
