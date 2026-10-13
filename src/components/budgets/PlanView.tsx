import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PayCardDialog } from "@/components/accounts/PayCardDialog";
import { AllocationList } from "@/components/allocations/AllocationList";
import { categoryNames } from "@/components/allocations/envelopes";
import {
  MoneyAmount,
  NegativeNote,
  OVERDRAWN_UNASSIGNED,
} from "@/components/allocations/MoneyAmount";
import { MoveMoneyDialog } from "@/components/allocations/MoveMoneyDialog";
import { RecordName } from "@/components/categories/RecordName";
import { advanceOnEnter, FormSheet } from "@/components/FormSheet";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountNames, useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useMonthView } from "@/hooks/useBudgets";
import { useCategoryList } from "@/hooks/useCategories";
import { useAccountMoney } from "@/hooks/useTransactions";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import type { AllocationRow } from "@/lib/allocations/projection";
import type { DistributeMode } from "@/lib/budgets/distribute";
import type { Budget } from "@/lib/budgets/inForce";
import { categoryMonth, type MonthView } from "@/lib/budgets/month";
import { planChange } from "@/lib/budgets/plan";
import { canFundBudget } from "@/lib/budgets/projection";
import type { CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { formatPHP, formatPHPInput, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import type { AccountMoney } from "@/lib/transactions/money";
import { cn, errorMessage } from "@/lib/utils";
import { parseLocalDate, shiftMonth, todayLocalDate } from "@/lib/utils/dates";
import { DistributeMoney } from "./DistributeMoney";
import { SetBudgetDialog } from "./SetBudgetDialog";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";

/** Opened from the route's search, so a payday toast or the checklist can link straight to it. */
export interface DistributeRequest {
  mode: DistributeMode;
  accountId?: string;
  amount?: string;
  date?: string;
}

/** Closed, adding an allocation (into a category when given), or editing one. */
type Moving = { allocation?: AllocationRow; toCategory?: CategoryRow } | null;

const shortMonth = (month: string) => format(parseLocalDate(`${month}-01`), "MMM");

/** Non-zero amounts by account ID, named and sorted by name. */
function namedAmounts(byId: Map<string, Cents> | undefined, names: Map<string, string>) {
  return [...(byId ?? [])]
    .filter(([, cents]) => cents !== 0)
    .map(([id, cents]) => ({ id, cents, name: names.get(id) ?? "A card" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Where the month's budgets are set and Unassigned money is given a job:
 * Distribute, Move money, and an amount per category. `month` is "yyyy-MM".
 */
export function PlanView({
  actor,
  month,
  currentMonth,
  distribute,
  onDistribute,
}: {
  actor: Actor;
  month: string;
  currentMonth: string;
  distribute: DistributeRequest | null;
  onDistribute: (mode: DistributeMode | null) => void;
}) {
  const list = useCategoryList();
  const accounts = useAccounts();
  const accountNames = useAccountNames();
  const thisMonth = useMonthView(month, currentMonth);
  const lastMonth = useMonthView(shiftMonth(month, -1), currentMonth);
  const [moving, setMoving] = useState<Moving>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const inUse = list && [...list.groups.flatMap((group) => group.categories), ...list.ungrouped];
  const details = inUse?.find((category) => category.id === detailsId);
  useCloseWhenGone(detailsId, inUse && (details ?? null), () => setDetailsId(null));

  if (!list || !inUse || !accounts || !accountNames || !thisMonth || !lastMonth) return null;
  const lastId = inUse.at(-1)?.id;

  const rows = (categories: CategoryRow[]) =>
    categories.length === 0 ? (
      <li className="px-3 py-2 text-sm text-muted-foreground">No categories in use.</li>
    ) : (
      categories.map((category) => (
        <PlanRow
          key={category.id}
          actor={actor}
          category={category}
          month={month}
          spent={{ last: lastMonth, this: thisMonth }}
          budget={categoryMonth(thisMonth, category.id).budget}
          fundingChoices={accounts.filter((account) => canFundBudget(account, category))}
          isLast={category.id === lastId}
          onMove={() => setMoving({ toCategory: category })}
          onDetails={() => setDetailsId(category.id)}
        />
      ))
    );

  return (
    <PageShell.Main className="space-y-4">
      <ToAssignBar
        actor={actor}
        accountNames={accountNames}
        onDistribute={() => onDistribute("income")}
        onMove={() => setMoving({})}
      />

      {inUse.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No categories yet. Set them up on <Link to="/categories">Categories</Link> first.
        </p>
      ) : (
        // Each amount saves as you leave it; Enter moves on, or saves the last one.
        <form
          ref={advanceOnEnter}
          aria-label="Plan"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }}
        >
          {list.groups.map((group) => (
            <section key={group.id} className="rounded-md border">
              <h2 className="border-b bg-muted/40 px-3 py-2">
                <RecordName record={group} showRetired />
              </h2>
              <ul aria-label={`${group.name} plan`} className="divide-y">
                {rows(group.categories)}
              </ul>
            </section>
          ))}
          {list.ungrouped.length > 0 && (
            <section className="rounded-md border">
              <h2 className="border-b px-3 py-2 text-sm font-normal text-muted-foreground">
                Waiting for their group to reach this device
              </h2>
              <ul aria-label="Ungrouped plan" className="divide-y">
                {rows(list.ungrouped)}
              </ul>
            </section>
          )}
        </form>
      )}

      <AllocationList
        categoryNames={categoryNames(list)}
        accountNames={accountNames}
        onEdit={(allocation) => setMoving({ allocation })}
      />

      {moving && (
        <MoveMoneyDialog
          actor={actor}
          allocation={moving.allocation}
          toCategory={moving.toCategory}
          onClose={() => setMoving(null)}
        />
      )}
      {details && (
        <SetBudgetDialog
          actor={actor}
          category={details}
          month={month}
          onClose={() => setDetailsId(null)}
        />
      )}
      {distribute && (
        <FormSheet
          title="Distribute money"
          description={
            distribute.mode === "opening"
              ? "Split a starting balance across its categories."
              : "Split income across the budgets."
          }
          onClose={() => onDistribute(null)}
        >
          <DistributeMoney
            actor={actor}
            mode={distribute.mode}
            initialAccountId={distribute.accountId}
            initialAmount={distribute.amount}
            initialDate={distribute.date ?? todayLocalDate()}
            onDone={() => onDistribute(null)}
          />
        </FormSheet>
      )}
    </PageShell.Main>
  );
}

/**
 * The money not yet in a category, where Distribute and Move money start,
 * with each account's Unassigned and Card Payments beneath. A retired account
 * still holding money stays listed until it's moved out.
 */
function ToAssignBar({
  actor,
  accountNames,
  onDistribute,
  onMove,
}: {
  actor: Actor;
  accountNames: Map<string, string>;
  onDistribute: () => void;
  onMove: () => void;
}) {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const accountMoney = useAccountMoney();
  const [expanded, setExpanded] = useState(false);
  if (!accounts || !retiredAccounts || !accountMoney) return null;

  const inUse = accounts.filter((account) => !isCreditCard(account));
  const retiredHoldingMoney = retiredAccounts.filter((account) => {
    const envelopes = accountMoney.get(account.id)?.envelopes;
    return (
      envelopes &&
      (envelopes.unassigned !== 0 ||
        [...envelopes.cardPayments.values()].some((cents) => cents !== 0))
    );
  });
  const listed = [...inUse, ...retiredHoldingMoney];
  const toAssign = sumCents(
    listed.map((account) => accountMoney.get(account.id)?.envelopes?.unassigned ?? ZERO_CENTS)
  );

  return (
    <section aria-label="To assign" className="space-y-3 rounded-md border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold">
          <MoneyAmount cents={toAssign} /> <span className="font-normal">to assign</span>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onMove} disabled={inUse.length === 0}>
            Move money
          </Button>
          <Button size="sm" onClick={onDistribute} disabled={inUse.length === 0}>
            Distribute
          </Button>
        </div>
      </div>
      {listed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a bank, cash or e-wallet account on Home first.
        </p>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 self-start"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            By account
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "transition-transform motion-reduce:transition-none",
                expanded && "rotate-180"
              )}
            />
          </Button>
          {expanded && (
            <UnassignedByAccount
              actor={actor}
              accounts={accounts}
              listed={listed}
              accountMoney={accountMoney}
              accountNames={accountNames}
            />
          )}
        </>
      )}
    </section>
  );
}

/** A card in use is paid from its Card Payment line in its Paying Account. */
function UnassignedByAccount({
  actor,
  accounts,
  listed,
  accountMoney,
  accountNames,
}: {
  actor: Actor;
  accounts: AccountRow[];
  listed: AccountRow[];
  accountMoney: Map<string, AccountMoney>;
  accountNames: Map<string, string>;
}) {
  const [payingCardId, setPayingCardId] = useState<string | null>(null);
  const payingCard = accounts.find((account) => account.id === payingCardId);
  useCloseWhenGone(payingCardId, payingCard ?? null, () => setPayingCardId(null));
  const payableFrom = (cardId: string, accountId: string) =>
    accounts.some((card) => card.id === cardId && card.payingAccountId === accountId);

  return (
    <>
      <ul aria-label="Unassigned by account" className="divide-y rounded-md border bg-background">
        {listed.map((account) => {
          const envelopes = accountMoney.get(account.id)?.envelopes;
          const unassigned = envelopes?.unassigned ?? ZERO_CENTS;
          return (
            <li key={account.id} className="space-y-1 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{account.name}</span>
                  {account.retired && <Badge variant="outline">Retired</Badge>}
                </p>
                <MoneyAmount cents={unassigned} />
              </div>
              <NegativeNote cents={unassigned} label={OVERDRAWN_UNASSIGNED} />
              {namedAmounts(envelopes?.cardPayments, accountNames).map(({ id, cents, name }) => (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
                >
                  <span className="min-w-0 truncate">Card Payment · {name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <MoneyAmount cents={cents} />
                    {payableFrom(id, account.id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Pay ${name}`}
                        onClick={() => setPayingCardId(id)}
                      >
                        Pay
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {payingCard && (
        <PayCardDialog actor={actor} card={payingCard} onClose={() => setPayingCardId(null)} />
      )}
    </>
  );
}

/** A category's budget for the month, typed in place, with what it spent and the money it holds as hints. */
function PlanRow({
  actor,
  category,
  month,
  spent,
  budget,
  fundingChoices,
  isLast,
  onMove,
  onDetails,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  spent: { last: MonthView; this: MonthView };
  budget: Budget | null;
  fundingChoices: AccountRow[];
  isLast: boolean;
  onMove: () => void;
  onDetails: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const stored = budget ? formatPHPInput(budget.amountCents) : "";
  const inputId = `plan-${category.id}`;
  const hintId = `${inputId}-hint`;
  const moneyId = `${inputId}-money`;
  const spentIn = (view: MonthView) => formatPHP(categoryMonth(view, category.id).spent);

  const save = async () => {
    if (draft === null) return;
    const change = planChange(draft, budget, fundingChoices);
    if (change.kind === "problem") {
      toast.error(`${category.name}: ${change.message}`);
      return;
    }
    if (change.kind === "set") {
      try {
        await setBudget(actor, { categoryId: category.id, fromMonth: month, ...change });
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't set the budget for ${category.name}.`));
        return;
      }
    }
    setDraft(null);
  };

  const act = (action: () => void) => () => {
    setActionsOpen(false);
    action();
  };

  return (
    <li className="flex items-center gap-2 py-2 pr-1 pl-6">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="flex min-w-0">
          <RecordName record={category} />
        </label>
        <p id={hintId} className="truncate text-xs text-muted-foreground">
          Spent {shortMonth(shiftMonth(month, -1))} {spentIn(spent.last)} · {shortMonth(month)}{" "}
          {spentIn(spent.this)}
        </p>
        <p id={moneyId} className="truncate text-xs text-muted-foreground">
          Holds <MoneyAmount cents={categoryMonth(spent.this, category.id).money} />
        </p>
      </div>
      <Input
        id={inputId}
        className="w-28 shrink-0 text-right tabular-nums"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        enterKeyHint={isLast ? "done" : "next"}
        aria-describedby={`${hintId} ${moneyId}`}
        value={draft ?? stored}
        onFocus={() => setDraft((current) => current ?? stored)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
      />
      <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`${category.name} actions`}>
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-48 flex-col p-1">
          <Button variant="ghost" className="justify-start" onClick={act(onMove)}>
            Move money
          </Button>
          <Button variant="ghost" className="justify-start" onClick={act(onDetails)}>
            Budget details
          </Button>
        </PopoverContent>
      </Popover>
    </li>
  );
}
