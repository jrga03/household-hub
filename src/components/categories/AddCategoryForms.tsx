import { useActionState, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { VisibilityField } from "@/components/VisibilityField";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/categories/events";
import type { GroupRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import type { Visibility } from "@/lib/events/log";
import { errorMessage } from "@/lib/utils";
import { GroupSelect } from "./GroupSelect";

interface AddState {
  error: string | null;
  added: number;
}

/** Runs the add, keeping the error on the form and counting adds so the fields can reset. */
function useAddAction(add: (formData: FormData) => Promise<string>, failure: string) {
  return useActionState(
    async (previous: AddState, formData: FormData): Promise<AddState> => {
      try {
        toast.success(await add(formData));
        return { error: null, added: previous.added + 1 };
      } catch (caught) {
        return { error: errorMessage(caught, failure), added: previous.added };
      }
    },
    { error: null, added: 0 }
  );
}

function NameField({ id, placeholder }: { id: string; placeholder: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Name</Label>
      <Input
        id={id}
        name="name"
        required
        maxLength={CATEGORY_NAME_MAX_LENGTH}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
}

export function AddCategoryForm({ actor, groups }: { actor: Actor; groups: GroupRow[] }) {
  const [state, addAction] = useAddAction(async (formData) => {
    const groupId = String(formData.get("groupId") ?? "");
    if (groupId === "") throw new Error("Choose a group.");
    await createCategory(actor, { name: String(formData.get("name") ?? ""), groupId });
    return "Category added";
  }, "Couldn't add the category.");

  return (
    <form action={addAction} className="@container space-y-4" aria-label="Add a category">
      <div key={state.added} className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <NameField id="category-name" placeholder="e.g. Groceries" />
        <GroupSelect id="category-group" groups={groups} />
      </div>
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="Adding...">Add category</SubmitButton>
    </form>
  );
}

export function AddGroupForm({ actor }: { actor: Actor }) {
  const [state, addAction] = useAddAction(async (formData) => {
    await createGroup(actor, {
      name: String(formData.get("name") ?? ""),
      visibility: String(formData.get("visibility") ?? ""),
    });
    return "Group added";
  }, "Couldn't add the group.");

  return (
    <form action={addAction} className="space-y-4" aria-label="Add a group">
      {/* Keyed so each new group starts as Household again; Personal is a deliberate choice. */}
      <NewGroupFields key={state.added} />
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="Adding...">Add group</SubmitButton>
    </form>
  );
}

function NewGroupFields() {
  const [visibility, setVisibility] = useState<Visibility>("household");
  return (
    <>
      <NameField id="group-name" placeholder="e.g. Food" />
      <VisibilityField idPrefix="group" value={visibility} onChange={setVisibility} />
    </>
  );
}
