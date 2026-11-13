import { useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import { SectionHeader } from "@/components/app/SectionHeader";
import { SubmitButton } from "@/components/app/SubmitButton";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/categories/events";
import type { Actor } from "@/lib/commands/accounts";
import { addPayday, deletePayday, movePayday, renamePayday } from "@/lib/commands/paydays";
import type { PaydayRow } from "@/lib/paydays/projection";
import { errorMessage } from "@/lib/utils";

/** The household's paydays in order, added, renamed, reordered and deleted in place (ADR 0014). */
export function PaydaysSection({ actor, paydays }: { actor: Actor; paydays: PaydayRow[] }) {
  // "new" opens the add dialog; a payday's ID opens its edit dialog.
  const [openId, setOpenId] = useState<string | null>(null);
  const editing = paydays.find((payday) => payday.id === openId);
  useCloseWhenGone(openId === "new" ? null : openId, editing ?? null, () => setOpenId(null));

  const move = async (payday: PaydayRow, direction: "up" | "down") => {
    try {
      await movePayday(actor, payday.id, direction);
    } catch (caught) {
      toast.error(errorMessage(caught, `Couldn't move ${payday.name}.`));
    }
  };

  return (
    <section aria-labelledby="paydays-heading" className="space-y-2">
      <SectionHeader
        title={<span id="paydays-heading">Paydays</span>}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => setOpenId("new")}>
            Add payday
          </Button>
        }
      />
      {paydays.length === 0 ? (
        <EmptyState>No paydays yet.</EmptyState>
      ) : (
        <ul aria-label="Paydays" className="divide-y border-y">
          {paydays.map((payday, index) => (
            <li key={payday.id} className="flex items-center gap-1 py-1 pr-2 pl-4">
              <span className="min-w-0 flex-1 truncate">{payday.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${payday.name} up`}
                disabled={index === 0}
                onClick={() => void move(payday, "up")}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${payday.name} down`}
                disabled={index === paydays.length - 1}
                onClick={() => void move(payday, "down")}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Edit ${payday.name}`}
                onClick={() => setOpenId(payday.id)}
              >
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {openId === "new" && <PaydayDialog actor={actor} onClose={() => setOpenId(null)} />}
      {editing && <PaydayDialog actor={actor} payday={editing} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/** Adds a payday, or renames or deletes one when given. */
function PaydayDialog({
  actor,
  payday,
  onClose,
}: {
  actor: Actor;
  payday?: PaydayRow;
  onClose: () => void;
}) {
  const title = payday ? "Edit payday" : "Add payday";
  const [error, saveAction] = useActionState(async (_previous: string | null, data: FormData) => {
    const name = String(data.get("name") ?? "");
    try {
      if (!payday) await addPayday(actor, name);
      else if (name.trim() !== payday.name) await renamePayday(actor, payday.id, name);
      toast.success("Saved");
      onClose();
      return null;
    } catch (caught) {
      return errorMessage(caught, "Couldn't save.");
    }
  }, null);
  const [deleting, startDeleting] = useTransition();
  const remove = (target: PaydayRow) =>
    startDeleting(async () => {
      try {
        await deletePayday(actor, target.id);
        toast.success(`${target.name} deleted`);
        onClose();
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't delete ${target.name}.`));
      }
    });

  return (
    <FormSheet
      title={title}
      description="Name an income the household expects each month, such as “15th salary”."
      onClose={onClose}
    >
      <ActionForm ref={advanceOnEnter} action={saveAction} className="space-y-4" aria-label={title}>
        <Field label="Name">
          <Input
            name="name"
            required
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            placeholder="15th salary"
            autoComplete="off"
            enterKeyHint="done"
            defaultValue={payday?.name}
          />
        </Field>
        <FormError>{error}</FormError>
        <FormFooter
          destructive={
            payday && { label: "Delete payday", onClick: () => remove(payday), disabled: deleting }
          }
        >
          <SubmitButton pendingText="Saving...">Save</SubmitButton>
        </FormFooter>
      </ActionForm>
    </FormSheet>
  );
}
