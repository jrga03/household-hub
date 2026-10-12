import { useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
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
import { useAccountNames, useAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useAccountMoney } from "@/hooks/useTransactions";
import { isCreditCard } from "@/lib/accounts/events";
import type { AllocationRow } from "@/lib/allocations/projection";
import { DEFAULT_GROUPS } from "@/lib/categories/defaults";
import type { RecordNoun } from "@/lib/categories/events";
import type { CategoryList, CategoryRow, GroupRow } from "@/lib/categories/projection";
import { seedDefaultCategories, unretireCategory, unretireGroup } from "@/lib/commands/categories";
import type { Actor } from "@/lib/commands/accounts";
import { sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { sumCategoryMoney, type AccountMoney, type CategoryMoney } from "@/lib/transactions/money";
import { cn, errorMessage } from "@/lib/utils";
import { AddCategoryForm, AddGroupForm } from "./AddCategoryForms";
import { EditCategoryDialog, EditGroupDialog } from "./EditCategoryDialogs";

type Editing = { kind: RecordNoun; id: string } | null;

/** Closed, adding a move, or editing one. */
type Moving = { allocation?: AllocationRow } | null;

interface MoneyView {
  categories: Map<string, CategoryMoney>;
  accountNames: Map<string, string>;
}

/** The accounts holding the category's money, by name, leaving out those at zero. */
function holdings(money: CategoryMoney | undefined, accountNames: Map<string, string>) {
  return [...(money?.byAccount ?? [])]
    .filter(([, cents]) => cents !== 0)
    .map(([accountId, cents]) => ({
      accountId,
      cents,
      name: accountNames.get(accountId) ?? "An account",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const totalOf = (money: MoneyView, categories: CategoryRow[]): Cents =>
  sumCents(categories.map((category) => money.categories.get(category.id)?.total ?? ZERO_CENTS));

function findEditing(list: CategoryList, editing: Editing) {
  if (!editing) return { group: undefined, category: undefined };
  if (editing.kind === "group") {
    return { group: list.groups.find((group) => group.id === editing.id), category: undefined };
  }
  const inUse = [...list.groups.flatMap((group) => group.categories), ...list.ungrouped];
  return { group: undefined, category: inUse.find((category) => category.id === editing.id) };
}

export function CategoriesView({ actor }: { actor: Actor }) {
  const list = useCategoryList();
  const accountMoney = useAccountMoney();
  const accountNames = useAccountNames();
  const categoryMoney = useMemo(
    () => accountMoney && sumCategoryMoney(accountMoney),
    [accountMoney]
  );
  const [editing, setEditing] = useState<Editing>(null);
  const [moving, setMoving] = useState<Moving>(null);

  if (!list || !accountMoney || !accountNames || !categoryMoney) return null;
  const money: MoneyView = { categories: categoryMoney, accountNames };

  const { group: editingGroup, category: editingCategory } = findEditing(list, editing);
  // Another device retired it mid-edit: drop it, so unretiring later doesn't reopen the dialog.
  if (editing && !editingGroup && !editingCategory) setEditing(null);

  const groupsInUse = list.groups.filter((group) => !group.retired);
  const hasHouseholdGroup = [...list.groups, ...list.retiredGroups].some(
    (group) => group.visibility === "household"
  );

  return (
    <>
      {!hasHouseholdGroup && <SuggestedCategories actor={actor} />}

      <UnassignedCard accountMoney={accountMoney} onMove={() => setMoving({})} />

      <Card>
        <CardHeader>
          <CardTitle>Groups and categories</CardTitle>
          <CardDescription>
            Household categories every member sees, and Personal ones only you see.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {list.groups.length === 0 && list.ungrouped.length === 0 && (
            <p className="text-sm text-muted-foreground">No groups yet. Add the first one below.</p>
          )}
          {list.groups.length > 0 && (
            <ul aria-label="Groups" className="space-y-4">
              {list.groups.map((group) => (
                <li key={group.id} className="rounded-md border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
                    <RecordName record={group} showRetired />
                    <div className="flex shrink-0 items-center gap-2">
                      <MoneyAmount
                        cents={totalOf(money, group.categories)}
                        className="font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit group ${group.name}`}
                        onClick={() => setEditing({ kind: "group", id: group.id })}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                  <CategoryItems
                    label={`${group.name} categories`}
                    categories={group.categories}
                    money={money}
                    onEdit={(id) => setEditing({ kind: "category", id })}
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
                money={money}
                onEdit={(id) => setEditing({ kind: "category", id })}
              />
            </div>
          )}
          <RetiredHoldingMoney categories={list.retiredCategories} money={money} />
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

/** Each account's Unassigned and Card Payments, where Move money starts. */
function UnassignedCard({
  accountMoney,
  onMove,
}: {
  accountMoney: Map<string, AccountMoney>;
  onMove: () => void;
}) {
  const accounts = useAccounts();
  const accountNames = useAccountNames();
  if (!accounts || !accountNames) return null;
  const holding = accounts.filter((account) => !isCreditCard(account));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unassigned</CardTitle>
        <CardDescription>Money in each account not yet in a category.</CardDescription>
        <CardAction>
          <Button onClick={onMove} disabled={holding.length === 0}>
            Move money
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {holding.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a bank, cash or e-wallet account on Home first.
          </p>
        ) : (
          <ul aria-label="Unassigned by account" className="divide-y rounded-md border">
            {holding.map((account) => {
              const envelopes = accountMoney.get(account.id)?.envelopes;
              const unassigned = envelopes?.unassigned ?? ZERO_CENTS;
              const cardPayments = [...(envelopes?.cardPayments ?? [])]
                .filter(([, cents]) => cents !== 0)
                .map(([cardId, cents]) => ({
                  cardId,
                  cents,
                  name: accountNames.get(cardId) ?? "A card",
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
              return (
                <li key={account.id} className="space-y-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{account.name}</span>
                    <MoneyAmount cents={unassigned} />
                  </div>
                  <NegativeNote cents={unassigned} label={OVERDRAWN_UNASSIGNED} />
                  {cardPayments.map(({ cardId, cents, name }) => (
                    <div
                      key={cardId}
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

/** A category's money, expandable into the accounts holding it. */
function CategoryMoneyItem({
  category,
  money,
  children,
}: {
  category: CategoryRow;
  money: MoneyView;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const categoryMoney = money.categories.get(category.id);
  const byAccount = holdings(categoryMoney, money.accountNames);
  const total = categoryMoney?.total ?? ZERO_CENTS;

  return (
    <li className="px-3 py-2 pl-6">
      <div className="flex items-center justify-between gap-3">
        <RecordName record={category} />
        <div className="flex shrink-0 items-center gap-1">
          <MoneyAmount cents={total} />
          {byAccount.length > 0 && (
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
      <NegativeNote cents={total} label={OVERSPENT_CATEGORY} />
      {expanded && byAccount.length > 0 && (
        <ul aria-label={`${category.name} by account`} className="mt-1 space-y-1 pl-3">
          {byAccount.map(({ accountId, cents, name }) => (
            <li
              key={accountId}
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

/** Retired categories keep their money until it's moved out, so they stay listed with it. */
function RetiredHoldingMoney({
  categories,
  money,
}: {
  categories: CategoryRow[];
  money: MoneyView;
}) {
  const holding = categories.filter(
    (category) => holdings(money.categories.get(category.id), money.accountNames).length > 0
  );
  if (holding.length === 0) return null;

  return (
    <div className="rounded-md border">
      <p className="border-b px-3 py-2 text-sm font-medium">Retired, still holding money</p>
      <ul aria-label="Retired, still holding money" className="divide-y">
        {holding.map((category) => (
          <CategoryMoneyItem key={category.id} category={category} money={money} />
        ))}
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
  money,
  onEdit,
}: {
  label: string;
  categories: CategoryRow[];
  money: MoneyView;
  onEdit: (id: string) => void;
}) {
  if (categories.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">No categories in use.</p>;
  }
  return (
    <ul aria-label={label} className="divide-y">
      {categories.map((category) => (
        <CategoryMoneyItem key={category.id} category={category} money={money}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${category.name}`}
            onClick={() => onEdit(category.id)}
          >
            Edit
          </Button>
        </CategoryMoneyItem>
      ))}
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
