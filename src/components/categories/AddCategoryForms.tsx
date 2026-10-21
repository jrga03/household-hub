import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { Input } from "@/components/app/Input";
import { SubmitButton } from "@/components/app/SubmitButton";
import { VisibilityField } from "@/components/app/VisibilityField";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/categories/events";
import type { GroupRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import type { Visibility } from "@/lib/events/ownership";
import { errorMessage } from "@/lib/utils";
import { GroupSelect } from "./GroupSelect";

interface AddState {
  error: string | null;
  groupError?: string;
  added: number;
}

/** Runs the add, keeping the error on the form and counting adds so the fields can reset. */
function useAddAction(
  add: (formData: FormData) => Promise<string | { groupError: string }>,
  failure: string
) {
  return useActionState(
    async (previous: AddState, formData: FormData): Promise<AddState> => {
      try {
        const result = await add(formData);
        if (typeof result !== "string") return { error: null, ...result, added: previous.added };
        toast.success(result);
        return { error: null, added: previous.added + 1 };
      } catch (caught) {
        return { error: errorMessage(caught, failure), added: previous.added };
      }
    },
    { error: null, added: 0 }
  );
}

function NameField({ placeholder }: { placeholder: string }) {
  return (
    <Field label="Name">
      <Input
        name="name"
        required
        maxLength={CATEGORY_NAME_MAX_LENGTH}
        placeholder={placeholder}
        autoComplete="off"
      />
    </Field>
  );
}

export function AddCategoryForm({ actor, groups }: { actor: Actor; groups: GroupRow[] }) {
  const [state, addAction] = useAddAction(async (formData) => {
    const groupId = String(formData.get("groupId") ?? "");
    if (groupId === "") return { groupError: "Choose a group." };
    await createCategory(actor, { name: String(formData.get("name") ?? ""), groupId });
    return "Category added";
  }, "Couldn't add the category.");

  return (
    <ActionForm action={addAction} className="@container space-y-4" aria-label="Add a category">
      <div key={state.added} className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <NameField placeholder="e.g. Groceries" />
        <Field label="Group" error={state.groupError}>
          {(control) => <GroupSelect {...control} groups={groups} />}
        </Field>
      </div>
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="Adding...">Add category</SubmitButton>
    </ActionForm>
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
    <ActionForm action={addAction} className="space-y-4" aria-label="Add a group">
      {/* Keyed so each new group starts as Household again; Personal is a deliberate choice. */}
      <NewGroupFields key={state.added} />
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="Adding...">Add group</SubmitButton>
    </ActionForm>
  );
}

function NewGroupFields() {
  const [visibility, setVisibility] = useState<Visibility>("household");
  return (
    <>
      <NameField placeholder="e.g. Food" />
      <VisibilityField idPrefix="group" value={visibility} onChange={setVisibility} />
    </>
  );
}
