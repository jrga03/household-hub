import { useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { RetiredSection, useRetiredActions } from "@/components/app/RetiredSection";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import { SectionHeader } from "@/components/app/SectionHeader";
import { SubmitButton } from "@/components/app/SubmitButton";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";
import { confirm } from "@/lib/confirm";
import { RECORD_NAME_MAX_LENGTH } from "@/lib/events/names";
import { hasPortionOn } from "@/lib/budgets/inForce";
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
  const namedByBudget = (paydayId: string) =>
    budgets.some((budget) => hasPortionOn(budget, paydayId));
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
          namedByBudget={namedByBudget(editing.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

function RetiredPaydays({ actor, retired }: { actor: Actor; retired: PaydayRow[] }) {
  const { busy, unretire } = useRetiredActions();

  return (
    <RetiredSection count={retired.length} label="Retired paydays" level={3}>
      {retired.map((payday) => (
        <li key={payday.id} className="flex items-center gap-3 py-1 pr-2 pl-4">
          <span className="min-w-0 flex-1 truncate">{payday.name}</span>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Unretire ${payday.name}`}
            disabled={busy}
            onClick={() => unretire(payday.name, () => unretirePayday(actor, payday.id))}
          >
            Unretire
          </Button>
        </li>
      ))}
    </RetiredSection>
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
  namedByBudget = false,
  onClose,
}: {
  actor: Actor;
  currentMonth: string;
  payday?: PaydayRow;
  namedByBudget?: boolean;
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
  const remove = async (target: PaydayRow) => {
    // A delete has no undo; a retire does (Unretire).
    if (
      !namedByBudget &&
      !(await confirm({
        title: `Delete ${target.name}?`,
        description: "You can’t undo this.",
        confirmLabel: "Delete payday",
        destructive: true,
      }))
    )
      return;
    startRemoving(async () => {
      const verb = namedByBudget ? "retire" : "delete";
      try {
        if (namedByBudget) await retirePayday(actor, target.id, currentMonth);
        else await deletePayday(actor, target.id);
        toast.success(`${target.name} ${verb}d`);
        onClose();
      } catch (caught) {
        toast.error(errorMessage(caught, `Couldn't ${verb} ${target.name}.`));
      }
    });
  };

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
              label: namedByBudget ? "Retire payday" : "Delete payday",
              onClick: () => void remove(payday),
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
