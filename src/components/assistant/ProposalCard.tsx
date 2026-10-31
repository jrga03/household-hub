import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { Input } from "@/components/app/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
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
  // Deciding removes the focused button, so focus moves to the outcome instead of the page.
  const decidedHere = useRef(false);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (decided && decidedHere.current) outcomeRef.current?.focus();
  }, [decided]);
  const dismiss = () => {
    decidedHere.current = true;
    void onDecide(callId, DISMISSED);
  };

  const kind = proposal.type === "income" ? "income" : "expense";
  return (
    <ActionForm
      action={(formData) => {
        decidedHere.current = true;
        confirmAction(formData);
      }}
      aria-label="Confirm transaction"
      className="@container space-y-4 border-y py-4"
    >
      <div className="space-y-1">
        <SectionHeader
          title={proposal.description}
          action={<Money kind={kind} cents={proposal.amountCents} />}
        />
        <p className="text-body text-muted-foreground">
          {kind === "income" ? "Income" : "Expense"}
          {proposal.notes && ` · ${proposal.notes}`}
        </p>
      </div>
      <fieldset disabled={decided} className="grid grid-cols-1 gap-4 @[480px]:grid-cols-3">
        <Field label="Account">
          {(control) => (
            <Select value={accountId} onValueChange={setAccountId} disabled={decided}>
              <SelectTrigger {...control} className="w-full">
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
          )}
        </Field>
        <Field label="Category (optional)">
          {(control) => (
            <CategorySelect
              {...control}
              choices={choices}
              value={shownCategoryId}
              onValueChange={setCategoryId}
            />
          )}
        </Field>
        <Field label="Date">
          <Input name="date" type="date" required defaultValue={shown.date} />
        </Field>
      </fieldset>
      <FormError>{error}</FormError>
      {decided ? (
        <p ref={outcomeRef} tabIndex={-1} className="w-fit rounded-md">
          <StatusBadge tone={decision.outcome === "recorded" ? "success" : "neutral"}>
            {decision.outcome === "recorded" ? "Recorded" : "Dismissed"}
          </StatusBadge>
        </p>
      ) : (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
          <SubmitButton pendingText="Recording…">Confirm</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
