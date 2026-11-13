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
import { RECORD_NAME_MAX_LENGTH } from "@/lib/events/names";
import type { BudgetRow } from "@/lib/budgets/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  addPayday,
  deletePayday,
  movePayday,
  renamePayday,
  retirePayday,
  unretirePayday,
} from "@/lib/commands/paydays";
import type { PaydayRow } from "@/lib/paydays/projection";
import { errorMessage } from "@/lib/utils";

/**
 * The household's paydays in order, added, renamed, reordered, retired and
 * deleted in place, then the retired ones (ADR 0014). `currentMonth` is "yyyy-MM".
 */
export function PaydaysSection({
  actor,
  paydays: allPaydays,
  budgets,
  currentMonth,
}: {
  actor: Actor;
  paydays: PaydayRow[];
  /** Every budget version, to tell a payday to delete from one to retire. */
  budgets: BudgetRow[];
  currentMonth: string;
}) {
  const paydays = allPaydays.filter((payday) => !payday.retired);
  // "new" opens the add dialog; a payday's ID opens its edit dialog.
  const [openId, setOpenId] = useState<string | null>(null);
  const editing = paydays.find((payday) => payday.id === openId);
  const named = (paydayId: string) =>
    budgets.some((budget) => budget.portions.some((portion) => portion.paydayId === paydayId));
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

      <RetiredPaydays actor={actor} retired={allPaydays.filter((payday) => payday.retired)} />

      {openId === "new" && (
        <PaydayDialog actor={actor} currentMonth={currentMonth} onClose={() => setOpenId(null)} />
      )}
      {editing && (
        <PaydayDialog
          actor={actor}
          currentMonth={currentMonth}
          payday={editing}
          named={named(editing.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

function RetiredPaydays({ actor, retired }: { actor: Actor; retired: PaydayRow[] }) {
  const [shown, setShown] = useState(false);
  const [busy, startAction] = useTransition();
  if (retired.length === 0) return null;

  const unretire = (payday: PaydayRow) =>
    startAction(async () => {
      try {
        await unretirePayday(actor, payday.id);
        toast.success(`${payday.name} is back in use`);
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't unretire ${payday.name}.`));
      }
    });

  return (
    <div className="space-y-1">
      <SectionHeader
        level={3}
        title="Retired"
        action={
          <Button
            variant="link"
            className="h-auto p-0"
            aria-expanded={shown}
            onClick={() => setShown(!shown)}
          >
            {shown ? "Hide retired" : `Show retired (${retired.length})`}
          </Button>
        }
      />
      {shown && (
        <ul aria-label="Retired paydays" className="divide-y border-y">
          {retired.map((payday) => (
            <li key={payday.id} className="flex items-center gap-3 py-1 pr-2 pl-4">
              <span className="min-w-0 flex-1 truncate">{payday.name}</span>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Unretire ${payday.name}`}
                disabled={busy}
                onClick={() => unretire(payday)}
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

/**
 * Adds a payday, or renames one when given. A payday no budget ever named
 * deletes; one a budget names retires, so the budget history keeps its name.
 */
function PaydayDialog({
  actor,
  currentMonth,
  payday,
  named = false,
  onClose,
}: {
  actor: Actor;
  currentMonth: string;
  payday?: PaydayRow;
  named?: boolean;
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
  const [removing, startRemoving] = useTransition();
  const remove = (target: PaydayRow) =>
    startRemoving(async () => {
      const verb = named ? "retire" : "delete";
      try {
        if (named) await retirePayday(actor, target.id, currentMonth);
        else await deletePayday(actor, target.id);
        toast.success(`${target.name} ${verb}d`);
        onClose();
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't ${verb} ${target.name}.`));
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
            maxLength={RECORD_NAME_MAX_LENGTH}
            placeholder="15th salary"
            autoComplete="off"
            enterKeyHint="done"
            defaultValue={payday?.name}
          />
        </Field>
        <FormError>{error}</FormError>
        <FormFooter
          destructive={
            payday && {
              label: named ? "Retire payday" : "Delete payday",
              onClick: () => remove(payday),
              disabled: removing,
            }
          }
        >
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </FormFooter>
      </ActionForm>
    </FormSheet>
  );
}
