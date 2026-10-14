import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/FormSheet";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccountMoney } from "@/hooks/useTransactions";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/categories/events";
import {
  canHold,
  type CategoryRow,
  type GroupListItem,
  type GroupRow,
} from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  moveCategory,
  renameCategory,
  renameGroup,
  retireCategory,
  retireGroup,
} from "@/lib/commands/categories";
import { formatPHP, type Cents } from "@/lib/currency";
import { sameOwnership } from "@/lib/events/log";
import { sumCategoryMoney } from "@/lib/transactions/money";
import { errorMessage } from "@/lib/utils";
import { GroupSelect } from "./GroupSelect";
import { todayLocalDate } from "@/lib/utils/dates";

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
    <FormSheet
      title={title}
      description="Changes reach your household's other devices when they sync."
      onClose={onClose}
    >
      <ActionForm ref={advanceOnEnter} action={saveAction} className="space-y-4" aria-label={title}>
        <div className="space-y-2">
          <Label htmlFor="edit-category-name">Name</Label>
          <Input
            id="edit-category-name"
            name="name"
            required
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            autoComplete="off"
            enterKeyHint="done"
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
        <FormFooter destructive={{ label: retireLabel, onClick: onRetire, disabled: retiring }}>
          <SubmitButton pendingText="Saving...">Save</SubmitButton>
        </FormFooter>
      </ActionForm>
    </FormSheet>
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
  groups: GroupListItem[];
  onClose: () => void;
}) {
  const accountMoney = useAccountMoney();
  const [movingMoney, setMovingMoney] = useState(false);
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
  const held = accountMoney && sumCategoryMoney(accountMoney).get(category.id);
  const holdsMoney =
    held !== undefined && [...held.byAccount.values()].some((cents) => cents !== 0);

  if (movingMoney && held) {
    return (
      <RetireMovingMoneyDialog
        actor={actor}
        category={category}
        held={held.total}
        groups={groups}
        onBack={() => setMovingMoney(false)}
        onClose={onClose}
      />
    );
  }

  return (
    <EditDialog
      title="Edit category"
      record={category}
      onClose={onClose}
      saveAction={saveAction}
      error={error}
      retiring={retiring}
      onRetire={holdsMoney ? () => setMovingMoney(true) : retire}
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

/** A category holding money retires only once its money moves into another (one change). */
function RetireMovingMoneyDialog({
  actor,
  category,
  held,
  groups,
  onBack,
  onClose,
}: {
  actor: Actor;
  category: CategoryRow;
  held: Cents;
  groups: GroupListItem[];
  onBack: () => void;
  onClose: () => void;
}) {
  const choices = groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter(
        (other) => other.id !== category.id && sameOwnership(other, category)
      ),
    }))
    .filter((group) => group.categories.length > 0);
  const [error, retireAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      try {
        await retireCategory(actor, category.id, {
          toCategoryId: String(formData.get("toCategoryId") ?? ""),
          date: todayLocalDate(),
        });
        toast.success(`${category.name} retired`);
        onClose();
        return null;
      } catch (caught) {
        return errorMessage(caught, `Couldn't retire ${category.name}.`);
      }
    },
    null
  );
  const title = `Retire ${category.name}`;

  return (
    <FormSheet
      title={title}
      description={`${category.name} holds ${formatPHP(held)}. Its money moves into another category first.`}
      onClose={onClose}
    >
      <ActionForm action={retireAction} className="space-y-4" aria-label={title}>
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add another category for its money first.</p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="retire-move-to">Move its money into</Label>
            <Select name="toCategoryId" required>
              <SelectTrigger id="retire-move-to" className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel>{group.name}</SelectLabel>
                    {group.categories.map((other) => (
                      <SelectItem key={other.id} value={other.id}>
                        {other.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <FormError>{error}</FormError>
        <FormFooter className="@[480px]:justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <SubmitButton pendingText="Retiring..." disabled={choices.length === 0}>
            Move and retire
          </SubmitButton>
        </FormFooter>
      </ActionForm>
    </FormSheet>
  );
}
