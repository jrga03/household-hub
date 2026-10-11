import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/categories/events";
import { canHold, type CategoryRow, type GroupRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  moveCategory,
  renameCategory,
  renameGroup,
  retireCategory,
  retireGroup,
} from "@/lib/commands/categories";
import { errorMessage } from "@/lib/utils";
import { GroupSelect } from "./GroupSelect";

const VISIBILITY_SUMMARY = {
  household: "Household: every member sees it.",
  personal: "Personal: only you see it.",
};

/** Saves the form, keeping the error on it; null once saved. */
function useSaveAction(save: (formData: FormData) => Promise<void>, onClose: () => void) {
  return useActionState(async (_previous: string | null, formData: FormData) => {
    try {
      await save(formData);
      toast.success("Saved");
      onClose();
      return null;
    } catch (caught) {
      return errorMessage(caught, "Couldn't save.");
    }
  }, null);
}

function useRetire(name: string, retire: () => Promise<void>, onClose: () => void) {
  const [retiring, startRetiring] = useTransition();
  const run = () =>
    startRetiring(async () => {
      try {
        await retire();
        toast.success(`${name} retired`);
        onClose();
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't retire ${name}.`));
      }
    });
  return [retiring, run] as const;
}

function EditDialog({
  title,
  record,
  onClose,
  saveAction,
  error,
  retiring,
  onRetire,
  retireLabel,
  children,
}: {
  title: string;
  record: GroupRow;
  onClose: () => void;
  saveAction: (formData: FormData) => void;
  error: string | null;
  retiring: boolean;
  onRetire: () => void;
  retireLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="@container">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Changes reach your household&apos;s other devices when they sync.
          </DialogDescription>
        </DialogHeader>
        <form action={saveAction} className="space-y-4" aria-label={title}>
          <div className="space-y-2">
            <Label htmlFor="edit-category-name">Name</Label>
            <Input
              id="edit-category-name"
              name="name"
              required
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              autoComplete="off"
              defaultValue={record.name}
            />
          </div>
          {children}
          <div className="space-y-1">
            <p className="text-sm font-medium">Who sees it</p>
            <p className="text-sm text-muted-foreground">
              {VISIBILITY_SUMMARY[record.visibility]} Visibility can&apos;t be changed.
            </p>
          </div>
          <FormError>{error}</FormError>
          <DialogFooter className="gap-2 @[480px]:justify-between">
            <Button type="button" variant="outline" onClick={onRetire} disabled={retiring}>
              {retireLabel}
            </Button>
            <SubmitButton pendingText="Saving...">Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditGroupDialog({
  actor,
  group,
  onClose,
}: {
  actor: Actor;
  group: GroupRow;
  onClose: () => void;
}) {
  const [error, saveAction] = useSaveAction(async (formData) => {
    const name = String(formData.get("name") ?? "");
    if (name.trim() !== group.name) await renameGroup(actor, group.id, name);
  }, onClose);
  const [retiring, retire] = useRetire(group.name, () => retireGroup(actor, group.id), onClose);

  return (
    <EditDialog
      title="Edit group"
      record={group}
      onClose={onClose}
      saveAction={saveAction}
      error={error}
      retiring={retiring}
      onRetire={retire}
      retireLabel="Retire group"
    >
      <p className="text-sm text-muted-foreground">
        A group retires once every category in it is retired.
      </p>
    </EditDialog>
  );
}

export function EditCategoryDialog({
  actor,
  category,
  groups,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  groups: GroupRow[];
  onClose: () => void;
}) {
  const choices = groups.filter((group) => canHold(group, category));
  // Rename and move are separate changes, so each survives another device's edit of the other.
  const [error, saveAction] = useSaveAction(async (formData) => {
    const name = String(formData.get("name") ?? "");
    const groupId = String(formData.get("groupId") ?? "");
    if (name.trim() !== category.name) await renameCategory(actor, category.id, name);
    if (groupId !== "" && groupId !== category.groupId) {
      await moveCategory(actor, category.id, groupId);
    }
  }, onClose);
  const [retiring, retire] = useRetire(
    category.name,
    () => retireCategory(actor, category.id),
    onClose
  );
  const inChoices = choices.some((group) => group.id === category.groupId);

  return (
    <EditDialog
      title="Edit category"
      record={category}
      onClose={onClose}
      saveAction={saveAction}
      error={error}
      retiring={retiring}
      onRetire={retire}
      retireLabel="Retire category"
    >
      <GroupSelect
        id="edit-category-group"
        groups={choices}
        defaultValue={inChoices ? category.groupId : undefined}
      />
    </EditDialog>
  );
}
