import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AllocationList } from "@/components/allocations/AllocationList";
import { categoryNames } from "@/components/allocations/envelopes";
import {
  MoneyAmount,
  NegativeNote,
  OVERDRAWN_UNASSIGNED,
  OVERSPENT_CATEGORY,
} from "@/components/allocations/MoneyAmount";
import { MoveMoneyDialog } from "@/components/allocations/MoveMoneyDialog";
import { SetBudgetDialog } from "@/components/budgets/SetBudgetDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAccountNames, useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useMonthView } from "@/hooks/useBudgets";
import { useCategoryList } from "@/hooks/useCategories";
import { useAccountMoney } from "@/hooks/useTransactions";
import { isCreditCard } from "@/lib/accounts/events";
import type { AllocationRow } from "@/lib/allocations/projection";
import {
  categoryMonth,
  sumMonthFigures,
  type CategoryMonth,
  type MonthFigures,
  type MonthView,
} from "@/lib/budgets/month";
import { DEFAULT_GROUPS } from "@/lib/categories/defaults";
import type { RecordNoun } from "@/lib/categories/events";
import type {
  CategoryList,
  CategoryRow,
  GroupListItem,
  GroupRow,
} from "@/lib/categories/projection";
import { seedDefaultCategories, unretireCategory, unretireGroup } from "@/lib/commands/categories";
import type { Actor } from "@/lib/commands/accounts";
import { formatPHP, ZERO_CENTS, type Cents } from "@/lib/currency";
import { sumCategoryMoney, type AccountMoney, type CategoryMoney } from "@/lib/transactions/money";
import { cn, errorMessage } from "@/lib/utils";
import { monthLabel, shiftMonth } from "@/lib/utils/dates";
import { AddCategoryForm, AddGroupForm } from "./AddCategoryForms";
import { EditCategoryDialog, EditGroupDialog } from "./EditCategoryDialogs";

type Editing = { kind: RecordNoun; id: string } | null;

/** Closed, adding an allocation, or editing one. */
type Moving = { allocation?: AllocationRow } | null;

/** The chosen month's figures, plus the current money a retired category still holds. */
interface MoneyView {
  month: MonthView;
  current: Map<string, CategoryMoney>;
  accountNames: Map<string, string>;
}

/** Non-zero amounts by account ID, named and sorted by name. */
function namedAmounts(
  byId: Map<string, Cents> | undefined,
  names: Map<string, string>,
  unknown: string
) {
  return [...(byId ?? [])]
    .filter(([, cents]) => cents !== 0)
    .map(([id, cents]) => ({ id, cents, name: names.get(id) ?? unknown }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A group's sums count its retired categories too, so a month's spending doesn't vanish on retiring. */
function groupFigures(
  moneyView: MoneyView,
  list: CategoryList,
  group: GroupListItem
): MonthFigures {
  const retired = list.retiredCategories.filter((category) => category.group?.id === group.id);
  return sumMonthFigures(
    [...group.categories, ...retired].map((category) => categoryMonth(moneyView.month, category.id))
  );
}

function findCategoryInUse(list: CategoryList, categoryId: string) {
  const inUse = [...list.groups.flatMap((group) => group.categories), ...list.ungrouped];
  return inUse.find((category) => category.id === categoryId);
}

function findEditing(list: CategoryList, editing: Editing) {
  if (!editing) return { group: undefined, category: undefined };
  if (editing.kind === "group") {
    return { group: list.groups.find((group) => group.id === editing.id), category: undefined };
  }
  return { group: undefined, category: findCategoryInUse(list, editing.id) };
}

/** `month` is "yyyy-MM"; `currentMonth` is this month on this device. */
export function CategoriesView({
  actor,
  month,
  currentMonth,
  onMonthChange,
}: {
  actor: Actor;
  month: string;
  currentMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const list = useCategoryList();
  const accountMoney = useAccountMoney();
  const accountNames = useAccountNames();
  const monthView = useMonthView(month, currentMonth);
  const categoryMoney = useMemo(
    () => accountMoney && sumCategoryMoney(accountMoney),
    [accountMoney]
  );
  const [editing, setEditing] = useState<Editing>(null);
  const [moving, setMoving] = useState<Moving>(null);
  const [budgeting, setBudgeting] = useState<string | null>(null);

  if (!list || !accountMoney || !accountNames || !categoryMoney || !monthView) return null;
  const moneyView: MoneyView = { month: monthView, current: categoryMoney, accountNames };

  const { group: editingGroup, category: editingCategory } = findEditing(list, editing);
  // Another device retired it mid-edit: drop it, so unretiring later doesn't reopen the dialog.
  if (editing && !editingGroup && !editingCategory) setEditing(null);
  const budgetingCategory = budgeting === null ? undefined : findCategoryInUse(list, budgeting);
  if (budgeting !== null && !budgetingCategory) setBudgeting(null);

  const groupsInUse = list.groups.filter((group) => !group.retired);
  const hasHouseholdGroup = [...list.groups, ...list.retiredGroups].some(
    (group) => group.visibility === "household"
  );

  return (
    <>
      {!hasHouseholdGroup && <SuggestedCategories actor={actor} />}

      <UnassignedCard
        accountMoney={accountMoney}
        accountNames={accountNames}
        onMove={() => setMoving({})}
      />

      <Card>
        <CardHeader>
          <CardTitle>Groups and categories</CardTitle>
          <CardDescription>
            Household categories every member sees, and Personal ones only you see.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <MonthPicker month={month} currentMonth={currentMonth} onChange={onMonthChange} />
          {list.groups.length === 0 && list.ungrouped.length === 0 && (
            <p className="text-sm text-muted-foreground">No groups yet. Add the first one below.</p>
          )}
          {list.groups.length > 0 && (
            <ul aria-label="Groups" className="space-y-4">
              {list.groups.map((group) => (
                <li key={group.id} className="rounded-md border">
                  <GroupHeader
                    group={group}
                    figures={groupFigures(moneyView, list, group)}
                    onEdit={() => setEditing({ kind: "group", id: group.id })}
                  />
                  <CategoryItems
                    label={`${group.name} categories`}
                    categories={group.categories}
                    moneyView={moneyView}
                    onEdit={(id) => setEditing({ kind: "category", id })}
                    onBudget={setBudgeting}
                  />
                </li>
              ))}
            </ul>
          )}
          {list.ungrouped.length > 0 && (
            <div className="space-y-2 rounded-md border">
              <p className="border-b px-3 py-2 text-sm text-muted-foreground">
                Waiting for their group to reach this device
              </p>
              <CategoryItems
                label="Ungrouped categories"
                categories={list.ungrouped}
                moneyView={moneyView}
                onEdit={(id) => setEditing({ kind: "category", id })}
                onBudget={setBudgeting}
              />
            </div>
          )}
          <RetiredHoldingMoney categories={list.retiredCategories} moneyView={moneyView} />
          <RetiredCategories actor={actor} list={list} />
        </CardContent>
      </Card>

      <AllocationList
        categoryNames={categoryNames(list)}
        accountNames={accountNames}
        onEdit={(allocation) => setMoving({ allocation })}
      />

      <Card>
        <CardHeader>
          <CardTitle>Add</CardTitle>
          <CardDescription>
            A category belongs to a group and is seen by the same people as its group.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {groupsInUse.length > 0 && <AddCategoryForm actor={actor} groups={groupsInUse} />}
          <AddGroupForm actor={actor} />
        </CardContent>
      </Card>

      {editingGroup && (
        <EditGroupDialog actor={actor} group={editingGroup} onClose={() => setEditing(null)} />
      )}
      {editingCategory && (
        <EditCategoryDialog
          actor={actor}
          category={editingCategory}
          groups={groupsInUse}
          onClose={() => setEditing(null)}
        />
      )}
      {budgetingCategory && (
        <SetBudgetDialog
          actor={actor}
          category={budgetingCategory}
          month={month}
          onClose={() => setBudgeting(null)}
        />
      )}
      {moving && (
        <MoveMoneyDialog
          actor={actor}
          allocation={moving.allocation}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  );
}

/**
 * Each account's Unassigned and Card Payments, where Move money starts. A
 * retired account still holding money stays listed until it's moved out.
 */
function UnassignedCard({
  accountMoney,
  accountNames,
  onMove,
}: {
  accountMoney: Map<string, AccountMoney>;
  accountNames: Map<string, string>;
  onMove: () => void;
}) {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  if (!accounts || !retiredAccounts) return null;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unassigned</CardTitle>
        <CardDescription>Money in each account not yet in a category.</CardDescription>
        <CardAction>
          <Button onClick={onMove} disabled={inUse.length === 0}>
            Move money
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a bank, cash or e-wallet account on Home first.
          </p>
        ) : (
          <ul aria-label="Unassigned by account" className="divide-y rounded-md border">
            {listed.map((account) => {
              const envelopes = accountMoney.get(account.id)?.envelopes;
              const unassigned = envelopes?.unassigned ?? ZERO_CENTS;
              const cardPayments = namedAmounts(envelopes?.cardPayments, accountNames, "A card");
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
                  {cardPayments.map(({ id, cents, name }) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
                    >
                      <span className="min-w-0 truncate">Card Payment · {name}</span>
                      <MoneyAmount cents={cents} />
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** A category's money, expandable into the accounts holding it, with its month's figures when given. */
function CategoryMoneyItem({
  category,
  money,
  byAccount,
  accountNames,
  budgeting,
  children,
}: {
  category: CategoryRow;
  money: Cents;
  byAccount: Map<string, Cents>;
  accountNames: Map<string, string>;
  /** The month's figures, and opening Set budget; left out for a retired category. */
  budgeting?: { month: CategoryMonth; onSet: () => void };
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const holding = namedAmounts(byAccount, accountNames, "An account");

  return (
    <li className="px-3 py-2 pl-6">
      <div className="flex items-center justify-between gap-3">
        <RecordName record={category} />
        <div className="flex shrink-0 items-center gap-1">
          <MoneyAmount cents={money} />
          {holding.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              aria-expanded={expanded}
              aria-label={`${category.name} by account`}
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
            </Button>
          )}
          {children}
        </div>
      </div>
      <NegativeNote cents={money} label={OVERSPENT_CATEGORY} />
      {budgeting && (
        <FigureList
          label={`${category.name} budget, spent and allocated`}
          figures={sumMonthFigures([budgeting.month])}
          budget={
            <Button
              variant="link"
              className="h-auto p-0 text-xs"
              aria-label={`Set budget for ${category.name}`}
              onClick={budgeting.onSet}
            >
              {budgeting.month.budget ? formatPHP(budgeting.month.budget.amountCents) : "Set"}
            </Button>
          }
          fundedBy={
            budgeting.month.budget
              ? (accountNames.get(budgeting.month.budget.accountId) ?? "An account")
              : null
          }
        />
      )}
      {expanded && holding.length > 0 && (
        <ul aria-label={`${category.name} by account`} className="mt-1 space-y-1 pl-3">
          {holding.map(({ id, cents, name }) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
            >
              <span className="min-w-0 truncate">{name}</span>
              <MoneyAmount cents={cents} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A group's name and money, with its categories' month figures summed. */
function GroupHeader({
  group,
  figures,
  onEdit,
}: {
  group: GroupListItem;
  figures: MonthFigures;
  onEdit: () => void;
}) {
  return (
    <div className="border-b bg-muted/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <RecordName record={group} showRetired />
        <div className="flex shrink-0 items-center gap-2">
          <MoneyAmount cents={figures.money} className="font-medium" />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit group ${group.name}`}
            onClick={onEdit}
          >
            Edit
          </Button>
        </div>
      </div>
      {group.categories.length > 0 && (
        <FigureList label={`${group.name} budget, spent and allocated`} figures={figures} />
      )}
    </div>
  );
}

/**
 * A month's budget, spent and allocated. A category's budget is a button
 * naming its funding account; a group's is the sum of its categories'.
 */
function FigureList({
  label,
  figures,
  budget,
  fundedBy,
}: {
  label: string;
  figures: MonthFigures;
  budget?: React.ReactNode;
  fundedBy?: string | null;
}) {
  return (
    <dl aria-label={label} className="grid grid-cols-3 gap-2 pt-1 text-xs text-muted-foreground">
      <div className="min-w-0">
        <dt>Budget</dt>
        <dd className="truncate tabular-nums text-foreground">
          {budget ?? formatPHP(figures.budget)}
          {fundedBy && <span className="block truncate text-muted-foreground">{fundedBy}</span>}
        </dd>
      </div>
      <div className="min-w-0">
        <dt>Spent</dt>
        <dd className="truncate tabular-nums text-foreground">{formatPHP(figures.spent)}</dd>
      </div>
      <div className="min-w-0">
        <dt>Allocated</dt>
        <dd className="truncate tabular-nums text-foreground">{formatPHP(figures.allocated)}</dd>
      </div>
    </dl>
  );
}

function MonthPicker({
  month,
  currentMonth,
  onChange,
}: {
  month: string;
  currentMonth: string;
  onChange: (month: string) => void;
}) {
  const isCurrent = month === currentMonth;
  return (
    <div className="space-y-1">
      <div role="group" aria-label="Month" className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => onChange(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <p className="min-w-36 text-center font-medium" aria-live="polite">
          {monthLabel(month)}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => onChange(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
        {!isCurrent && (
          <Button variant="link" className="h-auto p-0" onClick={() => onChange(currentMonth)}>
            This month
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {isCurrent
          ? "Each category's money now, with this month's budget, spending and allocations."
          : `Each category's money at the end of ${monthLabel(month)}, with that month's budget, spending and allocations.`}
      </p>
    </div>
  );
}

/** Retired categories keep their money until it's moved out, so they stay listed with it. */
function RetiredHoldingMoney({
  categories,
  moneyView,
}: {
  categories: CategoryRow[];
  moneyView: MoneyView;
}) {
  const stillHolding = categories.filter((category) =>
    [...(moneyView.current.get(category.id)?.byAccount.values() ?? [])].some((cents) => cents !== 0)
  );
  if (stillHolding.length === 0) return null;

  return (
    <div className="rounded-md border">
      <p className="border-b px-3 py-2 text-sm font-medium">Retired, still holding money</p>
      <ul aria-label="Retired, still holding money" className="divide-y">
        {stillHolding.map((category) => {
          const current = moneyView.current.get(category.id);
          return (
            <CategoryMoneyItem
              key={category.id}
              category={category}
              money={current?.total ?? ZERO_CENTS}
              byAccount={current?.byAccount ?? new Map()}
              accountNames={moneyView.accountNames}
            />
          );
        })}
      </ul>
    </div>
  );
}

/** A group or category's name, badged when Personal, and when retired if `showRetired`. */
function RecordName({ record, showRetired }: { record: GroupRow; showRetired?: boolean }) {
  return (
    <p className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{record.name}</span>
      {record.visibility === "personal" && <Badge variant="secondary">Personal</Badge>}
      {showRetired && record.retired && <Badge variant="outline">Retired</Badge>}
    </p>
  );
}

function CategoryItems({
  label,
  categories,
  moneyView,
  onEdit,
  onBudget,
}: {
  label: string;
  categories: CategoryRow[];
  moneyView: MoneyView;
  onEdit: (id: string) => void;
  onBudget: (id: string) => void;
}) {
  if (categories.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">No categories in use.</p>;
  }
  return (
    <ul aria-label={label} className="divide-y">
      {categories.map((category) => {
        const month = categoryMonth(moneyView.month, category.id);
        return (
          <CategoryMoneyItem
            key={category.id}
            category={category}
            money={month.money}
            byAccount={month.moneyByAccount}
            accountNames={moneyView.accountNames}
            budgeting={{ month, onSet: () => onBudget(category.id) }}
          >
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${category.name}`}
              onClick={() => onEdit(category.id)}
            >
              Edit
            </Button>
          </CategoryMoneyItem>
        );
      })}
    </ul>
  );
}

function SuggestedCategories({ actor }: { actor: Actor }) {
  const [seeding, startSeeding] = useTransition();

  const seed = () =>
    startSeeding(async () => {
      try {
        await seedDefaultCategories(actor);
        toast.success("Suggested categories added");
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't add the suggested categories."));
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start with suggested categories</CardTitle>
        <CardDescription>
          {DEFAULT_GROUPS.map((group) => group.name).join(", ")}, each with a few categories.
          Rename, move or retire any of them later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={seed} disabled={seeding}>
          {seeding ? "Adding..." : "Use suggested categories"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RetiredCategories({ actor, list }: { actor: Actor; list: CategoryList }) {
  const [shown, setShown] = useState(false);
  const [unretiring, startUnretiring] = useTransition();
  const count = list.retiredGroups.length + list.retiredCategories.length;

  if (count === 0) return null;

  const unretire = (name: string, action: () => Promise<void>) =>
    startUnretiring(async () => {
      try {
        await action();
        toast.success(`${name} is back in use`);
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't unretire ${name}.`));
      }
    });

  return (
    <div className="space-y-3">
      <Button variant="link" className="h-auto p-0" onClick={() => setShown(!shown)}>
        {shown ? "Hide retired" : `Show retired (${count})`}
      </Button>
      {shown && (
        <ul aria-label="Retired" className="divide-y rounded-md border">
          {list.retiredGroups.map((group) => (
            <li key={group.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <RecordName record={group} />
                <p className="text-sm text-muted-foreground">Group</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Unretire group ${group.name}`}
                disabled={unretiring}
                onClick={() => unretire(group.name, () => unretireGroup(actor, group.id))}
              >
                Unretire
              </Button>
            </li>
          ))}
          {list.retiredCategories.map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <RecordName record={category} />
                <p className="text-sm text-muted-foreground">
                  {category.group ? `In ${category.group.name}` : "Group not on this device yet"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Unretire ${category.name}`}
                disabled={unretiring}
                onClick={() => unretire(category.name, () => unretireCategory(actor, category.id))}
              >
                Unretire
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
