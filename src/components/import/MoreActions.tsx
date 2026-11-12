import { useActionState, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/app/DropdownMenu";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { FormFooter, FormSheet } from "@/components/app/FormSheet";
import { SubmitButton } from "@/components/app/SubmitButton";
import { PaidFromSelect } from "@/components/transactions/PaidFromSelect";
import type { AccountRow } from "@/lib/accounts/projection";
import { setDraftsPaidFrom } from "@/lib/import/drafts";
import { countOf, errorMessage } from "@/lib/utils";

export interface MenuAction {
  label: string;
  disabled: boolean;
  onClick: () => void;
}

/** The selection bar's "⋯": Paid from… for the savable selection, then the discards. */
export function MoreActions({
  draftIds,
  card,
  actions,
}: {
  draftIds: string[];
  card: AccountRow | undefined;
  actions: MenuAction[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const items: MenuAction[] = [
    { label: "Paid from…", disabled: draftIds.length === 0, onClick: () => setSheetOpen(true) },
    ...actions,
  ];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" aria-label="More actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {items.map((item) => (
            <DropdownMenuItem key={item.label} disabled={item.disabled} onSelect={item.onClick}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {sheetOpen && (
        <PaidFromSheet draftIds={draftIds} card={card} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}

interface SheetProblems {
  account: string | undefined;
  form: string | null;
}

const NO_PROBLEMS: SheetProblems = { account: undefined, form: null };

function PaidFromSheet({
  draftIds,
  card,
  onClose,
}: {
  draftIds: string[];
  card: AccountRow | undefined;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string>();
  const drafts = countOf(draftIds.length, "draft", "drafts");
  const [problems, setAction] = useActionState(
    async (_previous: SheetProblems, formData: FormData): Promise<SheetProblems> => {
      const accountId = String(formData.get("paidFromId") ?? "");
      if (accountId === "") return { account: "Choose an account.", form: null };
      try {
        await setDraftsPaidFrom(draftIds, accountId);
        toast.success(`Set Paid from on ${drafts}`);
        onClose();
        return NO_PROBLEMS;
      } catch (error) {
        return { account: undefined, form: errorMessage(error, "Couldn't change the drafts.") };
      }
    },
    NO_PROBLEMS
  );
  return (
    <FormSheet
      title="Paid from"
      description={`Which account's Card Payment money holds ${drafts}.`}
      onClose={onClose}
    >
      <ActionForm action={setAction} noValidate className="space-y-4" aria-label="Paid from">
        <Field label="Paid from" error={problems.account}>
          {(control) => (
            <PaidFromSelect
              {...control}
              name="paidFromId"
              card={card}
              value={chosen}
              placeholder="Choose an account"
              onChange={setChosen}
            />
          )}
        </Field>
        <FormError>{problems.form}</FormError>
        <FormFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pendingText="Setting…">Set on {drafts}</SubmitButton>
        </FormFooter>
      </ActionForm>
    </FormSheet>
  );
}
