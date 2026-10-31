import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/app/Button";
import { deleteWithUndo } from "@/components/app/deleteWithUndo";
import { EmptyState } from "@/components/app/EmptyState";
import { ListRow } from "@/components/app/ListRow";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { useCategoryList } from "@/hooks/useCategories";
import { DEFAULT_GROUPS } from "@/lib/categories/defaults";
import type { RecordNoun } from "@/lib/categories/events";
import {
  categoriesInUse,
  hasHouseholdGroup,
  type CategoryList,
  type CategoryRow,
  type GroupListItem,
  type GroupRow,
} from "@/lib/categories/projection";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";
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
import { errorMessage } from "@/lib/utils";
import { AddCategoryForm, AddGroupForm } from "./AddCategoryForms";
import { EditCategoryDialog, EditGroupDialog } from "./EditCategoryDialogs";
import { RecordName } from "./RecordName";

type Editing = { kind: RecordNoun; id: string } | null;

function findEditing(list: CategoryList, editing: Editing) {
  if (!editing) return { group: undefined, category: undefined };
  if (editing.kind === "group") {
    return { group: list.groups.find((group) => group.id === editing.id), category: undefined };
  }
  return {
    group: undefined,
    category: categoriesInUse(list).find((category) => category.id === editing.id),
  };
}

/** Setting up groups and categories; their money is on Budget, Set budgets and Assign money. */
export function CategoriesView({ actor }: { actor: Actor }) {
  const list = useCategoryList();
  const [editing, setEditing] = useState<Editing>(null);
  const found = list && findEditing(list, editing);
  useCloseWhenGone(editing, found && (found.group ?? found.category ?? null), () =>
    setEditing(null)
  );

  if (!list || !found) return null;
  const { group: editingGroup, category: editingCategory } = found;
  const groupsInUse = list.groups.filter((group) => !group.retired);
  const editCategory = (id: string) => setEditing({ kind: "category", id });

  return (
    <PageShell.Main className="space-y-8">
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
                    action={
                      <GroupActions
                        group={group}
                        onEdit={() => setEditing({ kind: "group", id: group.id })}
                      />
                    }
                  />
                  <CategoryItems
                    label={`${group.name} categories`}
                    categories={group.categories}
                    onEdit={editCategory}
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
            <CategoryItems
              label="Ungrouped categories"
              categories={list.ungrouped}
              onEdit={editCategory}
            />
          </section>
        )}
        <RetiredCategories actor={actor} list={list} />
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
    </PageShell.Main>
  );
}

function GroupActions({ group, onEdit }: { group: GroupListItem; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {group.visibility === "personal" && <StatusBadge tone="neutral">Personal</StatusBadge>}
      {group.retired && <StatusBadge tone="outline">Retired</StatusBadge>}
      <Button
        variant="ghost"
        size="sm"
        className="-mr-3"
        aria-label={`Edit group ${group.name}`}
        onClick={onEdit}
      >
        Edit
      </Button>
    </div>
  );
}

function CategoryItems({
  label,
  categories,
  onEdit,
}: {
  label: string;
  categories: CategoryRow[];
  onEdit: (id: string) => void;
}) {
  if (categories.length === 0) {
    return <EmptyState className="py-2">No categories in use.</EmptyState>;
  }
  return (
    <ul aria-label={label} className="-mx-4 divide-y border-y">
      {categories.map((category) => (
        <li key={category.id}>
          <ListRow
            onClick={() => onEdit(category.id)}
            label={
              <>
                <span className="sr-only">Edit</span> <RecordName record={category} />
              </>
            }
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

function RetiredCategories({ actor, list }: { actor: Actor; list: CategoryList }) {
  const [shown, setShown] = useState(false);
  const [busy, startAction] = useTransition();
  const count = list.retiredGroups.length + list.retiredCategories.length;

  if (count === 0) return null;

  const unretire = (name: string, action: () => Promise<void>) =>
    startAction(async () => {
      try {
        await action();
        toast.success(`${name} is back in use`);
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't unretire ${name}.`));
      }
    });

  return (
    <section className="space-y-1">
      <SectionHeader
        title="Retired"
        action={
          <Button
            variant="link"
            className="h-auto p-0"
            aria-expanded={shown}
            onClick={() => setShown(!shown)}
          >
            {shown ? "Hide retired" : `Show retired (${count})`}
          </Button>
        }
      />
      {shown && (
        <ul aria-label="Retired" className="-mx-4 divide-y border-y">
          {list.retiredGroups.map((group) => (
            <RetiredItem
              key={group.id}
              record={group}
              detail="Group"
              labelSuffix={`group ${group.name}`}
              disabled={busy}
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
              labelSuffix={category.name}
              disabled={busy}
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
        </ul>
      )}
    </section>
  );
}

function RetiredItem({
  record,
  detail,
  labelSuffix,
  disabled,
  onUnretire,
  onDelete,
}: {
  record: GroupRow;
  detail: string;
  /** What the buttons name for a screen reader: "group Food" or "Groceries". */
  labelSuffix: string;
  disabled: boolean;
  onUnretire: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <RecordName record={record} />
        <p className="truncate text-muted-foreground">{detail}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive active:text-destructive"
          aria-label={`Delete ${labelSuffix}`}
          disabled={disabled}
          onClick={onDelete}
        >
          Delete
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Unretire ${labelSuffix}`}
          disabled={disabled}
          onClick={onUnretire}
        >
          Unretire
        </Button>
      </div>
    </li>
  );
}
