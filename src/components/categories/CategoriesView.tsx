import { useState, useTransition } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { DetailPane, resolveOpenItem, useOpenItem } from "@/components/layout/DetailPane";
import { Button } from "@/components/app/Button";
import { deleteWithUndo } from "@/components/app/withUndo";
import { EmptyState } from "@/components/app/EmptyState";
import { Fact, Facts } from "@/components/app/Facts";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { RetiredSection, useRetiredActions } from "@/components/app/RetiredSection";
import { StatusBadge } from "@/components/app/StatusBadge";
import { namedAmountsLargestFirst } from "@/components/allocations/envelopes";
import { useAccountNames } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useAccountMoney } from "@/hooks/useTransactions";
import { DEFAULT_GROUPS } from "@/lib/categories/defaults";
import {
  hasHouseholdGroup,
  type CategoryList,
  type CategoryRow,
  type GroupListItem,
  type GroupRow,
} from "@/lib/categories/projection";
import {
  deleteCategory,
  deleteGroup,
  restoreCategory,
  restoreGroup,
  seedDefaultCategories,
  unretireCategory,
  unretireGroup,
} from "@/lib/commands/categories";
import type { Actor } from "@/lib/commands/accounts";
import { VISIBILITY_LABELS } from "@/lib/events/ownership";
import { sumCategoryMoney, sumGroupMoney, type CategoryMoney } from "@/lib/transactions/money";
import { ZERO_CENTS, type Cents } from "@/lib/currency";
import { errorMessage } from "@/lib/utils";
import { AddCategoryForm, AddGroupForm } from "./AddCategoryForms";
import { EditCategoryDialog, EditGroupDialog } from "./EditCategoryDialogs";
import { RecordName } from "./RecordName";

interface CategoryInGroup {
  category: CategoryRow;
  group: GroupRow | null;
}

type OpenRecord =
  | { kind: "group"; group: GroupRow; editable: boolean; categoryIds: string[] }
  | ({ kind: "category" } & CategoryInGroup);

/** A group first, then a category in use, ungrouped or retired. */
function findRecord(list: CategoryList, id: string): OpenRecord | undefined {
  const categories: CategoryInGroup[] = [
    ...list.groups.flatMap((group) => group.categories.map((category) => ({ category, group }))),
    ...list.ungrouped.map((category) => ({ category, group: null })),
    ...list.retiredCategories.map((category) => ({ category, group: category.group })),
  ];
  const inUse = list.groups.find((group) => group.id === id);
  const group = inUse ?? list.retiredGroups.find((retired) => retired.id === id);
  if (group) {
    const categoryIds = categories
      .filter((entry) => entry.group?.id === id)
      .map((entry) => entry.category.id);
    // A retired group without categories in use is unretired or deleted from its Retired row.
    return { kind: "group", group, editable: inUse !== undefined, categoryIds };
  }
  const category = categories.find((entry) => entry.category.id === id);
  return category && { kind: "category", ...category };
}

const recordOf = (record: OpenRecord) => (record.kind === "group" ? record.group : record.category);

function describeRecord(record: OpenRecord) {
  if (record.kind === "group") return "Group";
  return record.group?.name ?? "Group not on this device yet";
}

/**
 * Setting up groups and categories, each with its money now across accounts.
 * A group or category opens in the `DetailPane`, with its money in each account.
 */
export function CategoriesView({ actor }: { actor: Actor }) {
  const list = useCategoryList();
  const accountMoney = useAccountMoney();
  const accountNames = useAccountNames();
  const { openId, open } = useOpenItem();
  const openRecord = resolveOpenItem(openId, list && ((id) => findRecord(list, id)));

  if (!list || !accountMoney || !accountNames) return null;
  const money = sumCategoryMoney(accountMoney);
  const groupsInUse = list.groups.filter((group) => !group.retired);
  const rows = { money, openId, onOpen: open };

  return (
    <>
      <PageShell.List className="max-w-3xl space-y-8">
        {!hasHouseholdGroup(list) && <SuggestedCategories actor={actor} />}

        <div className="space-y-8">
          {list.groups.length === 0 && list.ungrouped.length === 0 && (
            <EmptyState className="py-0">
              No groups yet. Household categories every member sees, and Personal ones only you see.
              Add the first group below.
            </EmptyState>
          )}
          {list.groups.length > 0 && (
            <ul aria-label="Groups" className="space-y-8">
              {list.groups.map((group) => (
                <li key={group.id}>
                  <section aria-label={group.name} className="space-y-1">
                    <SectionHeader
                      title={group.name}
                      action={<GroupActions group={group} onOpen={() => open(group.id)} />}
                    />
                    <CategoryItems
                      label={`${group.name} categories`}
                      categories={group.categories}
                      {...rows}
                    />
                  </section>
                </li>
              ))}
            </ul>
          )}
          {list.ungrouped.length > 0 && (
            <section aria-label="Ungrouped" className="space-y-1">
              <SectionHeader title="Ungrouped" />
              <p className="text-body text-muted-foreground">
                Waiting for their group to reach this device.
              </p>
              <CategoryItems label="Ungrouped categories" categories={list.ungrouped} {...rows} />
            </section>
          )}
          <RetiredCategories actor={actor} list={list} openId={openId} onOpen={open} />
        </div>

        {groupsInUse.length > 0 && (
          <section className="space-y-4">
            <div className="space-y-1">
              <SectionHeader title="Add a category" />
              <p className="text-body text-muted-foreground">
                A category belongs to a group and is seen by the same people as its group.
              </p>
            </div>
            <AddCategoryForm actor={actor} groups={groupsInUse} />
          </section>
        )}
        <section className="space-y-4">
          <SectionHeader title="Add a group" />
          <AddGroupForm actor={actor} />
        </section>
      </PageShell.List>
      <DetailPane
        title={openRecord ? recordOf(openRecord).name : ""}
        description={openRecord && describeRecord(openRecord)}
        item={openRecord}
      >
        {(record) => (
          // Keyed, so an open dialog doesn't follow a newly picked record.
          <RecordDetail
            key={recordOf(record).id}
            actor={actor}
            record={record}
            money={money}
            accountNames={accountNames}
            groups={groupsInUse}
          />
        )}
      </DetailPane>
    </>
  );
}

/** The open group or category: its money in each account, who sees it, and its actions. */
function RecordDetail({
  actor,
  record,
  money,
  accountNames,
  groups,
}: {
  actor: Actor;
  record: OpenRecord;
  money: Map<string, CategoryMoney>;
  accountNames: Map<string, string>;
  groups: GroupListItem[];
}) {
  const [editing, setEditing] = useState(false);
  const { visibility, retired } = recordOf(record);
  const held =
    record.kind === "group"
      ? sumGroupMoney(money, record.categoryIds)
      : money.get(record.category.id);
  const editable = record.kind === "group" ? record.editable : !record.category.retired;
  const closeDialog = () => setEditing(false);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-caption text-muted-foreground">Money</p>
        <Money kind="balance" cents={held?.total ?? ZERO_CENTS} className="block text-heading" />
      </div>
      <MoneyInAccounts byAccount={held?.byAccount ?? new Map()} accountNames={accountNames} />
      <Facts>
        <Fact term="Who sees it">{VISIBILITY_LABELS[visibility]}</Fact>
        {retired && <Fact term="Status">Retired</Fact>}
      </Facts>
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        {record.kind === "category" && (
          <Button asChild variant="ghost">
            <Link to="/transactions" search={{ category: record.category.id }}>
              View transactions
            </Link>
          </Button>
        )}
      </div>
      {editing &&
        (record.kind === "group" ? (
          <EditGroupDialog actor={actor} group={record.group} onClose={closeDialog} />
        ) : (
          <EditCategoryDialog
            actor={actor}
            category={record.category}
            groups={groups}
            onClose={closeDialog}
          />
        ))}
    </div>
  );
}

function MoneyInAccounts({
  byAccount,
  accountNames,
}: {
  byAccount: Map<string, Cents>;
  accountNames: Map<string, string>;
}) {
  const lines = namedAmountsLargestFirst(byAccount, accountNames, "An account");
  if (lines.length === 0) {
    return <p className="text-body text-muted-foreground">Not in any account</p>;
  }
  return (
    <Facts>
      {lines.map(({ id, cents, name }) => (
        <Fact
          key={id}
          term={
            <Link
              to="/accounts"
              search={{ open: id }}
              className="text-body font-medium text-primary underline-offset-4 hover:underline"
            >
              {name}
            </Link>
          }
        >
          <Money kind="balance" cents={cents} />
        </Fact>
      ))}
    </Facts>
  );
}

function GroupActions({ group, onOpen }: { group: GroupListItem; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {group.visibility === "personal" && <StatusBadge tone="neutral">Personal</StatusBadge>}
      {group.retired && <StatusBadge tone="outline">Retired</StatusBadge>}
      <Button
        variant="ghost"
        size="icon-sm"
        className="-mr-2"
        aria-label={`Open group ${group.name}`}
        onClick={onOpen}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}

interface RowsProps {
  openId: string | null;
  onOpen: (id: string) => void;
}

function CategoryItems({
  label,
  categories,
  money,
  openId,
  onOpen,
}: RowsProps & {
  label: string;
  categories: CategoryRow[];
  money: Map<string, CategoryMoney>;
}) {
  if (categories.length === 0) {
    return <EmptyState className="py-2">No categories in use.</EmptyState>;
  }
  return (
    <ul aria-label={label} className="-mx-4 divide-y border-y">
      {categories.map((category) => (
        <li key={category.id}>
          <ListRow
            onClick={() => onOpen(category.id)}
            open={category.id === openId}
            label={<RecordName record={category} />}
            amount={<Money kind="balance" cents={money.get(category.id)?.total ?? ZERO_CENTS} />}
            trailing={<ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />}
          />
        </li>
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
    <section className="space-y-3">
      <div className="space-y-1">
        <SectionHeader title="Start with suggested categories" />
        <p className="text-body text-muted-foreground">
          {DEFAULT_GROUPS.map((group) => group.name).join(", ")}, each with a few categories.
          Rename, move or retire any of them later.
        </p>
      </div>
      <Button onClick={seed} disabled={seeding}>
        {seeding ? "Adding..." : "Use suggested categories"}
      </Button>
    </section>
  );
}

function RetiredCategories({
  actor,
  list,
  ...rows
}: RowsProps & { actor: Actor; list: CategoryList }) {
  const { busy, startAction, unretire } = useRetiredActions();

  return (
    <RetiredSection
      count={list.retiredGroups.length + list.retiredCategories.length}
      label="Retired"
      className="-mx-4"
    >
      {list.retiredGroups.map((group) => (
        <RetiredItem
          key={group.id}
          record={group}
          detail="Group"
          recordLabel={`group ${group.name}`}
          disabled={busy}
          {...rows}
          onUnretire={() => unretire(group.name, () => unretireGroup(actor, group.id))}
          onDelete={() =>
            startAction(() =>
              deleteWithUndo(
                group.name,
                () => deleteGroup(actor, group.id),
                () => restoreGroup(actor, group.id)
              )
            )
          }
        />
      ))}
      {list.retiredCategories.map((category) => (
        <RetiredItem
          key={category.id}
          record={category}
          detail={category.group ? `In ${category.group.name}` : "Group not on this device yet"}
          recordLabel={category.name}
          disabled={busy}
          {...rows}
          onUnretire={() => unretire(category.name, () => unretireCategory(actor, category.id))}
          onDelete={() =>
            startAction(() =>
              deleteWithUndo(
                category.name,
                () => deleteCategory(actor, category.id),
                () => restoreCategory(actor, category.id)
              )
            )
          }
        />
      ))}
    </RetiredSection>
  );
}

function RetiredItem({
  record,
  detail,
  recordLabel,
  disabled,
  onUnretire,
  onDelete,
  openId,
  onOpen,
}: RowsProps & {
  record: GroupRow;
  detail: string;
  /** What the buttons name for a screen reader: "group Food" or "Groceries". */
  recordLabel: string;
  disabled: boolean;
  onUnretire: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 pr-4">
      <ListRow
        className="min-w-0 flex-1"
        onClick={() => onOpen(record.id)}
        open={record.id === openId}
        label={<RecordName record={record} />}
        detail={detail}
      />
      <div className="flex shrink-0 gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive active:text-destructive"
          aria-label={`Delete ${recordLabel}`}
          disabled={disabled}
          onClick={onDelete}
        >
          Delete
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Unretire ${recordLabel}`}
          disabled={disabled}
          onClick={onUnretire}
        >
          Unretire
        </Button>
      </div>
    </li>
  );
}
