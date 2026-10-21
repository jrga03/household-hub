import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { Field } from "@/components/app/Field";
import { FormFooter, FormSheet } from "@/components/app/FormSheet";
import { FormError } from "@/components/app/FormError";
import { Notice } from "@/components/app/Notice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { SubmitButton } from "@/components/app/SubmitButton";
import { useAccounts } from "@/hooks/useAccounts";
import { useBudgets } from "@/hooks/useBudgets";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";
import { budgetInForce } from "@/lib/budgets/inForce";
import { canFundBudget } from "@/lib/budgets/projection";
import type { CategoryRow } from "@/lib/categories/projection";
import type { BudgetRow } from "@/lib/budgets/projection";
import type { Actor } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { parsePHPSafe, PESO_SIGN, type Cents } from "@/lib/currency";
import { VISIBILITY_LABELS } from "@/lib/events/ownership";
import { errorMessage } from "@/lib/utils";
import { monthLabel, shiftMonth } from "@/lib/utils/dates";

type BudgetProblems = Partial<Record<"amount" | "form", string>>;

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
  const amountFor = (from: string) => inForceFrom(from)?.amountCents;
  const [fromMonth, setFromMonth] = useState(month);
  const [accountId, setAccountId] = useState(() => accountFor(month));
  const [amount, setAmount] = useState<Cents | undefined>(() => amountFor(month));
  const budget = inForceFrom(fromMonth);
  // A retired or no longer fitting funding account isn't a choice; say so rather than switch silently.
  const fundingGone =
    budget !== null && !fundingChoices.some((account) => account.id === budget.accountId);

  const chooseFromMonth = (from: string) => {
    setFromMonth(from);
    setAccountId(accountFor(from));
    setAmount(amountFor(from));
  };
  const months = Array.from({ length: MONTHS_AROUND * 2 + 1 }, (_, index) =>
    shiftMonth(month, index - MONTHS_AROUND)
  );

  const [problems, saveAction] = useActionState(
    async (_previous: BudgetProblems, formData: FormData): Promise<BudgetProblems> => {
      const parsed = parsePHPSafe(String(formData.get("amount") ?? ""));
      if (!parsed.success) return { amount: parsed.error.message };
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
        return {};
      } catch (caught) {
        return { form: errorMessage(caught, "Couldn't set the budget.") };
      }
    },
    {}
  );
  const formRef = useFocusFirstProblem(problems);

  return (
    <ActionForm
      ref={formRef}
      action={saveAction}
      noValidate
      className="space-y-4"
      aria-label={`Budget for ${category.name}`}
    >
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <Field
          label={`Amount (${PESO_SIGN})`}
          hint="0 clears it from that month."
          error={problems.amount}
        >
          <CurrencyInput
            name="amount"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="done"
            value={amount}
            onChange={setAmount}
          />
        </Field>
        <Field label="From">
          {(control) => (
            <Select value={fromMonth} onValueChange={chooseFromMonth}>
              <SelectTrigger {...control} className="w-full">
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
          )}
        </Field>
        <div className="space-y-2 @[480px]:col-span-2">
          {fundingChoices.length === 0 ? (
            <Notice title="Funding account">
              Add a {VISIBILITY_LABELS[category.visibility]} bank, cash or e-wallet account on
              Accounts first.
            </Notice>
          ) : (
            <Field
              label="Funding account"
              hint="Where this budget’s money goes when you distribute a payday."
            >
              {(control) => (
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger {...control} className="w-full">
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
            </Field>
          )}
          {fundingGone && fundingChoices.length > 0 && (
            <Notice tone="warning">
              Its funding account is retired or no longer fits. Choose another.
            </Notice>
          )}
        </div>
      </div>

      <FormError>{problems.form ?? null}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Saving…">Save budget</SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}
