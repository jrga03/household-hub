import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategoryList } from "@/hooks/useCategories";
import { DEFAULT_GROUPS } from "@/lib/categories/defaults";
import type { RecordNoun } from "@/lib/categories/events";
import {
  hasHouseholdGroup,
  type CategoryList,
  type CategoryRow,
  type GroupListItem,
} from "@/lib/categories/projection";
import { seedDefaultCategories, unretireCategory, unretireGroup } from "@/lib/commands/categories";
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
  const inUse = [...list.groups.flatMap((group) => group.categories), ...list.ungrouped];
  return { group: undefined, category: inUse.find((category) => category.id === editing.id) };
}

/** Setting up groups and categories; their money is on Budget and Plan. */
export function CategoriesView({ actor }: { actor: Actor }) {
  const list = useCategoryList();
  const [editing, setEditing] = useState<Editing>(null);

  if (!list) return null;
  const { group: editingGroup, category: editingCategory } = findEditing(list, editing);
  // Another device retired it mid-edit: drop it, so unretiring later doesn't reopen the dialog.
  if (editing && !editingGroup && !editingCategory) setEditing(null);
  const groupsInUse = list.groups.filter((group) => !group.retired);
  const editCategory = (id: string) => setEditing({ kind: "category", id });

  return (
    <PageShell.Main className="space-y-4">
      {!hasHouseholdGroup(list) && <SuggestedCategories actor={actor} />}

      <Card>
        <CardContent className="space-y-6">
          {list.groups.length === 0 && list.ungrouped.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No groups yet. Household categories every member sees, and Personal ones only you see.
              Add the first group below.
            </p>
          )}
          {list.groups.length > 0 && (
            <ul aria-label="Groups" className="space-y-4">
              {list.groups.map((group) => (
                <li key={group.id} className="rounded-md border">
                  <GroupHeader
                    group={group}
                    onEdit={() => setEditing({ kind: "group", id: group.id })}
                  />
                  <CategoryItems
                    label={`${group.name} categories`}
                    categories={group.categories}
                    onEdit={editCategory}
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
                onEdit={editCategory}
              />
            </div>
          )}
          <RetiredCategories actor={actor} list={list} />
        </CardContent>
      </Card>

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
    </PageShell.Main>
  );
}

function GroupHeader({ group, onEdit }: { group: GroupListItem; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
      <RecordName record={group} showRetired />
      <Button variant="ghost" size="sm" aria-label={`Edit group ${group.name}`} onClick={onEdit}>
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
    return <p className="px-3 py-2 text-sm text-muted-foreground">No categories in use.</p>;
  }
  return (
    <ul aria-label={label} className="divide-y">
      {categories.map((category) => (
        <li key={category.id} className="flex items-center justify-between gap-3 py-1 pr-3 pl-6">
          <RecordName record={category} />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${category.name}`}
            onClick={() => onEdit(category.id)}
          >
            Edit
          </Button>
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
