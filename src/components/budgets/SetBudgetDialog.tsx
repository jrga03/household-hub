import { useActionState, useState } from "react";
import { toast } from "sonner";
import { AccountSelect } from "@/components/accounts/AccountSelect";
import { ActionForm } from "@/components/app/ActionForm";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { Field } from "@/components/app/Field";
import { FormFooter, FormSheet, FULL_ROW } from "@/components/app/FormSheet";
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
import { useBudgets, usePaydays } from "@/hooks/useBudgets";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";
import { budgetInForce } from "@/lib/budgets/inForce";
import { canFundBudget } from "@/lib/budgets/projection";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryRow } from "@/lib/categories/projection";
import type { BudgetRow } from "@/lib/budgets/projection";
import type { Actor } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { formatPHP, parsePHPSafe, PESO_SIGN, sumCents, type Cents } from "@/lib/currency";
import type { Portion } from "@/lib/budgets/events";
import { paydaysNamedOrInUse, type PaydayRow } from "@/lib/paydays/projection";
import { VISIBILITY_LABELS } from "@/lib/events/ownership";
import { cn, errorMessage } from "@/lib/utils";
import { monthLabel, shiftMonth } from "@/lib/utils/dates";

type BudgetProblems = Partial<Record<"amount" | "portions" | "form", string>>;

const PORTIONS_ERROR_ID = "budget-portions-error";

/** How far either side of the chosen month a budget can be set from. */
const MONTHS_AROUND = 12;

/** Sets the category's budget from a month on; the amount and account start from the one in force then. */
export function SetBudgetDialog({
  actor,
  category,
  month,
  currentMonth,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  currentMonth: string;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const budgets = useBudgets();
  const paydays = usePaydays();
  if (!accounts || !budgets || !paydays) return null;
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
        currentMonth={currentMonth}
        budgets={budgets}
        paydays={paydays}
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
  currentMonth,
  budgets,
  paydays: allPaydays,
  fundingChoices,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  currentMonth: string;
  budgets: BudgetRow[];
  paydays: PaydayRow[];
  fundingChoices: AccountRow[];
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
  const portionsFor = (from: string) =>
    new Map(inForceFrom(from)?.portions.map((portion) => [portion.paydayId, portion.amountCents]));
  const [fromMonth, setFromMonth] = useState(month);
  const [accountId, setAccountId] = useState(() => accountFor(month));
  const [amount, setAmount] = useState<Cents | undefined>(() => amountFor(month));
  const [portions, setPortions] = useState(() => portionsFor(month));
  const budget = inForceFrom(fromMonth);
  // A retired payday the budget still names stays, so the member sees where that portion went.
  const paydays = paydaysNamedOrInUse(allPaydays, budget ? [budget] : []);
  // A retired or no longer fitting funding account isn't a choice; say so rather than switch silently.
  const fundingGone =
    budget !== null && !fundingChoices.some((account) => account.id === budget.accountId);

  const chooseFromMonth = (from: string) => {
    setFromMonth(from);
    setAccountId(accountFor(from));
    setAmount(amountFor(from));
    setPortions(portionsFor(from));
  };
  const months = Array.from({ length: MONTHS_AROUND * 2 + 1 }, (_, index) =>
    shiftMonth(month, index - MONTHS_AROUND)
  );

  const [problems, saveAction] = useActionState(
    async (_previous: BudgetProblems, formData: FormData): Promise<BudgetProblems> => {
      const parsed = parsePHPSafe(String(formData.get("amount") ?? ""));
      if (!parsed.success) return { amount: parsed.error.message };
      const clearing = parsed.value === 0;
      const split: Portion[] = [];
      for (const payday of paydays) {
        const portion = parsePHPSafe(String(formData.get(`portion-${payday.id}`) ?? "") || "0");
        if (!portion.success) return { portions: `${payday.name}: ${portion.error.message}` };
        if (portion.value > 0) split.push({ paydayId: payday.id, amountCents: portion.value });
      }
      const total = sumCents(split.map((portion) => portion.amountCents));
      if (!clearing && split.length > 0 && total !== parsed.value) {
        return {
          portions: `These add up to ${formatPHP(total)}. Make them add up to ${formatPHP(parsed.value)}, or leave them all blank.`,
        };
      }
      try {
        await setBudget(
          actor,
          {
            categoryId: category.id,
            fromMonth,
            amountCents: parsed.value,
            accountId: clearing || accountId === "" ? null : accountId,
            portions: split,
          },
          currentMonth
        );
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
        <div className={cn("space-y-2", FULL_ROW)}>
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
                <AccountSelect
                  {...control}
                  accounts={fundingChoices}
                  value={accountId}
                  onValueChange={setAccountId}
                />
              )}
            </Field>
          )}
          {fundingGone && fundingChoices.length > 0 && (
            <Notice tone="warning">
              Its funding account is retired or no longer fits. Choose another.
            </Notice>
          )}
        </div>
        {paydays.length > 0 && (
          <fieldset className={cn("space-y-2", FULL_ROW)}>
            <legend className="text-label font-medium">Portions by payday</legend>
            <p className="text-caption text-muted-foreground">
              Leave them all blank so any payday pays it.
            </p>
            <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
              {paydays.map((payday) => (
                <Field
                  key={payday.id}
                  label={payday.retired ? `${payday.name} (retired)` : payday.name}
                >
                  {(control) => (
                    <CurrencyInput
                      {...control}
                      // The sum is one problem for the whole set, so every portion points at it.
                      aria-invalid={problems.portions ? true : undefined}
                      aria-describedby={problems.portions ? PORTIONS_ERROR_ID : undefined}
                      name={`portion-${payday.id}`}
                      placeholder="0.00"
                      autoComplete="off"
                      value={portions.get(payday.id)}
                      onChange={(cents) =>
                        setPortions((before) => new Map(before).set(payday.id, cents))
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            {problems.portions && (
              <p id={PORTIONS_ERROR_ID} className="text-caption text-destructive">
                {problems.portions}
              </p>
            )}
          </fieldset>
        )}
      </div>

      <FormError>{problems.form ?? null}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Saving…">Save budget</SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}
