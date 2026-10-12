import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { isCreditCard } from "@/lib/accounts/events";
import type { Budget } from "@/lib/budgets/inForce";
import type { CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { formatPHPInput, parsePHPSafe, PESO_SIGN } from "@/lib/currency";
import { sameOwnership, VISIBILITY_LABELS } from "@/lib/events/log";
import { errorMessage } from "@/lib/utils";
import { monthLabel, shiftMonth } from "@/lib/utils/dates";

/** How far either side of the chosen month a budget can be set from. */
const MONTHS_AROUND = 12;

/** Sets the category's budget from a month on; the amount and account start from the one in force. */
export function SetBudgetDialog({
  actor,
  category,
  month,
  budget,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  budget: Budget | null;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  if (!accounts) return null;
  // The funding account shares the category's visibility and holds envelopes (ADR 0007).
  const fundingChoices = accounts.filter(
    (account) => sameOwnership(account, category) && !isCreditCard(account)
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="@container max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Budget for {category.name}</DialogTitle>
          <DialogDescription>
            A monthly target. It stands from the month you choose until a later month changes it.
          </DialogDescription>
        </DialogHeader>
        <SetBudgetForm
          actor={actor}
          category={category}
          month={month}
          budget={budget}
          fundingChoices={fundingChoices}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function SetBudgetForm({
  actor,
  category,
  month,
  budget,
  fundingChoices,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  budget: Budget | null;
  fundingChoices: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [fromMonth, setFromMonth] = useState(month);
  const funding = fundingChoices.find((account) => account.id === budget?.accountId);
  const [accountId, setAccountId] = useState(funding?.id ?? fundingChoices[0]?.id ?? "");
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
    <form action={saveAction} className="space-y-4" aria-label={`Budget for ${category.name}`}>
      <div className="grid gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="budget-amount">Amount ({PESO_SIGN})</Label>
          <Input
            id="budget-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            required
            defaultValue={budget ? formatPHPInput(budget.amountCents) : ""}
            aria-describedby="budget-amount-hint"
          />
          <p id="budget-amount-hint" className="text-xs text-muted-foreground">
            0 clears it from that month.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget-from">From</Label>
          <Select value={fromMonth} onValueChange={setFromMonth}>
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
          <p className="text-xs text-muted-foreground">
            Where this budget&apos;s money goes when you distribute a payday.
          </p>
        </div>
      </div>

      <FormError>{error}</FormError>
      <DialogFooter>
        <SubmitButton pendingText="Saving...">Save budget</SubmitButton>
      </DialogFooter>
    </form>
  );
}
