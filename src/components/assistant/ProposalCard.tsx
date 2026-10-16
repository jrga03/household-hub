import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
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
import {
  categoryChoices,
  CategorySelect,
  isCategoryChoice,
  UNASSIGNED,
} from "@/components/transactions/CategorySelect";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import type { AccountRow } from "@/lib/accounts/projection";
import { DISMISSED, type ProposalDecision, type ProposalEntry } from "@/lib/assistant/conversation";
import { canSee } from "@/lib/assistant/session";
import type { CategoryList } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { addTransaction } from "@/lib/commands/transactions";
import { formatPHP } from "@/lib/currency";
import { errorMessage } from "@/lib/utils";

type Decide = (callId: string, decision: ProposalDecision) => void;

/** add_transaction's proposal: nothing is written until the member taps Confirm (ADR 0010). */
export function ProposalCard({
  entry,
  actor,
  onDecide,
}: {
  entry: ProposalEntry;
  actor: Actor;
  onDecide: Decide;
}) {
  const accounts = useAccounts();
  const categories = useCategoryList();
  if (!accounts || !categories) return null;
  return (
    <ProposalForm
      entry={entry}
      actor={actor}
      accounts={accounts.filter(canSee(actor.userId))}
      categories={categories}
      onDecide={onDecide}
    />
  );
}

function ProposalForm({
  entry,
  actor,
  accounts,
  categories,
  onDecide,
}: {
  entry: ProposalEntry;
  actor: Actor;
  accounts: AccountRow[];
  categories: CategoryList;
  onDecide: Decide;
}) {
  const { callId, proposal, decision } = entry;
  const [accountId, setAccountId] = useState(proposal.accountId);
  const account = accounts.find((choice) => choice.id === accountId);
  const choices = categoryChoices(categories, account, null);
  const [categoryId, setCategoryId] = useState(proposal.categoryId ?? UNASSIGNED);
  // As on the transaction form, a category that can't hold money in the chosen account falls back to Unassigned.
  const shownCategoryId = isCategoryChoice(choices, categoryId) ? categoryId : UNASSIGNED;
  const categoryName =
    choices.flatMap((group) => group.categories).find((category) => category.id === shownCategoryId)
      ?.name ?? "Unassigned";

  const [error, confirmAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const date = String(formData.get("date") ?? "");
      const recorded = {
        ...proposal,
        date,
        accountId,
        categoryId: shownCategoryId === UNASSIGNED ? null : shownCategoryId,
      };
      try {
        await addTransaction(actor, { ...recorded, status: "cleared" });
      } catch (caught) {
        return errorMessage(caught, "Couldn't record the transaction.");
      }
      toast.success("Transaction added");
      onDecide(callId, {
        outcome: "recorded",
        content: JSON.stringify({
          recorded: {
            date,
            type: recorded.type,
            amount: formatPHP(recorded.amountCents),
            account: account?.name,
            category: categoryName,
            description: recorded.description,
          },
        }),
      });
      return null;
    },
    null
  );

  const decided = decision !== null;
  return (
    <ActionForm
      action={confirmAction}
      aria-label="Confirm transaction"
      className="@container space-y-3 rounded-lg border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-medium">{proposal.description}</p>
        <p className="shrink-0 font-semibold tabular-nums">{formatPHP(proposal.amountCents)}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {proposal.type === "income" ? "Income" : "Expense"}
        {proposal.notes && ` · ${proposal.notes}`}
      </p>
      <fieldset disabled={decided} className="grid grid-cols-1 gap-3 @[480px]:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${callId}-account`}>Account</Label>
          <Select value={accountId} onValueChange={setAccountId} disabled={decided}>
            <SelectTrigger id={`${callId}-account`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {choice.name}
                  {choice.visibility === "personal" && " (Personal)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${callId}-category`}>Category</Label>
          <CategorySelect
            id={`${callId}-category`}
            choices={choices}
            value={shownCategoryId}
            onValueChange={setCategoryId}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${callId}-date`}>Date</Label>
          <Input
            id={`${callId}-date`}
            name="date"
            type="date"
            required
            defaultValue={proposal.date}
          />
        </div>
      </fieldset>
      <FormError>{error}</FormError>
      {decided ? (
        <p className="text-sm font-medium text-muted-foreground">
          {decision.outcome === "recorded" ? "Recorded" : "Dismissed"}
        </p>
      ) : (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onDecide(callId, DISMISSED)}>
            Dismiss
          </Button>
          <SubmitButton pendingText="Recording...">Confirm</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
