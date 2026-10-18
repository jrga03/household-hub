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
import {
  DISMISSED,
  recordedDecision,
  type ProposalDecision,
  type ProposalItem,
} from "@/lib/assistant/conversation";
import { canSee } from "@/lib/assistant/session";
import type { CategoryList } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { addTransaction } from "@/lib/commands/transactions";
import { formatPHP } from "@/lib/currency";
import { errorMessage } from "@/lib/utils";

type Decide = (callId: string, decision: ProposalDecision) => void | Promise<void>;

/** add_transaction's proposal: nothing is written until the member taps Confirm (ADR 0010). */
export function ProposalCard({
  item,
  actor,
  onDecide,
}: {
  item: ProposalItem;
  actor: Actor;
  onDecide: Decide;
}) {
  const accounts = useAccounts();
  const categories = useCategoryList();
  if (!accounts || !categories) return null;
  return (
    <ProposalForm
      item={item}
      actor={actor}
      accounts={accounts.filter(canSee(actor.userId))}
      categories={categories}
      onDecide={onDecide}
    />
  );
}

function ProposalForm({
  item,
  actor,
  accounts,
  categories,
  onDecide,
}: {
  item: ProposalItem;
  actor: Actor;
  accounts: AccountRow[];
  categories: CategoryList;
  onDecide: Decide;
}) {
  const { callId, transactionId, proposal, decision } = item;
  // Once confirmed, the card shows what was recorded, also after leaving the screen and coming back.
  const shown = decision?.outcome === "recorded" ? decision.recorded : proposal;
  const [accountId, setAccountId] = useState(shown.accountId);
  const account = accounts.find((choice) => choice.id === accountId);
  const choices = categoryChoices(categories, account, null);
  const [categoryId, setCategoryId] = useState(shown.categoryId ?? UNASSIGNED);
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
        // The card's own id, so confirming again after a lost decision records nothing new.
        await addTransaction(actor, { ...recorded, id: transactionId, status: "cleared" });
      } catch (caught) {
        return errorMessage(caught, "Couldn't record the transaction.");
      }
      await onDecide(
        callId,
        recordedDecision(recorded, { account: account?.name ?? "", category: categoryName })
      );
      toast.success("Transaction added");
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
      <p className="text-body text-muted-foreground">
        {proposal.type === "income" ? "Income" : "Expense"}
        {proposal.notes && ` · ${proposal.notes}`}
      </p>
      <fieldset disabled={decided} className="grid grid-cols-1 gap-3 @[480px]:grid-cols-3">
        <div className="space-y-2">
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
        <div className="space-y-2">
          <Label htmlFor={`${callId}-category`}>Category</Label>
          <CategorySelect
            id={`${callId}-category`}
            choices={choices}
            value={shownCategoryId}
            onValueChange={setCategoryId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${callId}-date`}>Date</Label>
          <Input id={`${callId}-date`} name="date" type="date" required defaultValue={shown.date} />
        </div>
      </fieldset>
      <FormError>{error}</FormError>
      {decided ? (
        <p className="text-body font-medium text-muted-foreground">
          {decision.outcome === "recorded" ? "Recorded" : "Dismissed"}
        </p>
      ) : (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => void onDecide(callId, DISMISSED)}>
            Dismiss
          </Button>
          <SubmitButton pendingText="Recording...">Confirm</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
