import { useActionState, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { categoryNames, envelopeFromKey, envelopeKey } from "@/components/allocations/envelopes";
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
import { RadioGroup } from "@/components/ui/radio-group";
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
import { Textarea } from "@/components/ui/textarea";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { envelopeLabel, UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import { canHoldMoneyIn, type CategoryList, type CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  addTransfer,
  editTransfer,
  removeTransfer,
  restoreTransfer,
  setTransferStatus,
  type TransferInput,
} from "@/lib/commands/transfers";
import { formatPHPInput, parsePHPSafe, PESO_SIGN } from "@/lib/currency";
import { sameOwnership } from "@/lib/events/log";
import {
  DESCRIPTION_MAX_LENGTH,
  isTransactionStatus,
  NOTES_MAX_LENGTH,
  type TransactionStatus,
} from "@/lib/transactions/events";
import { TRANSFER_TYPE, type ListType } from "@/lib/transactions/filter";
import { transferLabel } from "@/lib/transfers/events";
import type { TransferRow } from "@/lib/transfers/projection";
import { cn, errorMessage } from "@/lib/utils";
import { useQuickEntryStore } from "@/stores/quickEntryStore";
import {
  ChoiceItem,
  DirectionChoice,
  FULL_ROW,
  SAVED_LOCALLY,
  useFocusNewEntry,
} from "./EntryFields";

/** Removes the transfer, offering Undo (a restore event) in the toast. */
export async function removeTransferWithUndo(actor: Actor, transfer: TransferRow): Promise<void> {
  try {
    await removeTransfer(actor, transfer.id);
  } catch (caught) {
    toast.error(errorMessage(caught, "Couldn't remove the transfer."));
    return;
  }
  toast.success(`Removed ${transferLabel(transfer)}`, {
    action: {
      label: "Undo",
      onClick: () =>
        void restoreTransfer(actor, transfer.id).catch((caught: unknown) =>
          toast.error(errorMessage(caught, "Couldn't restore the transfer."))
        ),
    },
  });
}

export function TransferDialog({
  actor,
  transfer,
  onClose,
}: {
  actor: Actor;
  transfer: TransferRow;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="@container max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit transfer</DialogTitle>
          <DialogDescription>{SAVED_LOCALLY}</DialogDescription>
        </DialogHeader>
        <TransferEditor actor={actor} transfer={transfer} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** The edit form alone, for the dialog and the wide-screen detail pane. */
export function TransferEditor({
  actor,
  transfer,
  onClose,
}: {
  actor: Actor;
  transfer: TransferRow;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  if (!accounts || !retiredAccounts || !categories) return null;
  return (
    <TransferForm
      actor={actor}
      transfer={transfer}
      accounts={accounts}
      retiredAccounts={retiredAccounts}
      categories={categories}
      onClose={onClose}
    />
  );
}

const accountLabel = (account: AccountRow) =>
  `${account.name}${account.visibility === "personal" ? " (Personal)" : ""}${account.retired ? " (retired)" : ""}`;

interface EnvelopeChoiceGroup {
  label: string;
  choices: { key: string; label: string }[];
}

/**
 * Unassigned and the categories in use the account's people hold money in, plus
 * the envelope the transfer already has (a retired category or a Card Payment).
 * Into a card, only its own Card Payment: that is paying it.
 */
function envelopeChoices(
  list: CategoryList,
  from: AccountRow | undefined,
  to: AccountRow | undefined,
  current: Envelope | undefined,
  accountNames: Map<string, string>
): EnvelopeChoiceGroup[] {
  if (to && isCreditCard(to)) {
    const cardPayment: Envelope = { kind: "card_payment", id: to.id };
    const label = envelopeLabel(cardPayment, new Map(), accountNames);
    return [{ label: "Card Payment", choices: [{ key: envelopeKey(cardPayment), label }] }];
  }
  const fits = (category: CategoryRow) => from !== undefined && canHoldMoneyIn(category, from);
  const toChoice = (category: CategoryRow) => ({
    key: envelopeKey({ kind: "category", id: category.id }),
    label: category.name,
  });
  const groups = [
    {
      label: "Unassigned",
      choices: [{ key: envelopeKey(UNASSIGNED_ENVELOPE), label: "Unassigned" }],
    },
    ...list.groups.map((group) => ({
      label: group.name,
      choices: group.categories.filter(fits).map(toChoice),
    })),
    { label: "Ungrouped", choices: list.ungrouped.filter(fits).map(toChoice) },
  ];
  const offered = new Set(groups.flatMap((group) => group.choices.map((choice) => choice.key)));
  if (current && !offered.has(envelopeKey(current))) {
    groups.push({
      label: "Current",
      choices: [
        {
          key: envelopeKey(current),
          label: envelopeLabel(current, categoryNames(list), accountNames),
        },
      ],
    });
  }
  return groups.filter((group) => group.choices.length > 0);
}

type ReadForm =
  | { input: TransferInput; status: TransactionStatus; error: null }
  | {
      input: null;
      status: null;
      error: string;
    };

function readTransferForm(formData: FormData): ReadForm {
  const amount = parsePHPSafe(String(formData.get("amount") ?? ""));
  if (!amount.success) return { input: null, status: null, error: amount.error.message };
  const envelope = envelopeFromKey(String(formData.get("envelope") ?? ""));
  if (!envelope) return { input: null, status: null, error: "Choose a category or Unassigned." };
  const status = formData.get("status");
  return {
    input: {
      date: String(formData.get("date") ?? ""),
      amountCents: amount.value,
      fromAccountId: String(formData.get("fromAccountId") ?? ""),
      toAccountId: String(formData.get("toAccountId") ?? ""),
      envelope,
      description: String(formData.get("description") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    },
    status: isTransactionStatus(status) ? status : "cleared",
    error: null,
  };
}

/**
 * Add when `transfer` is left out (from the Add transaction dialog's Transfer
 * choice); edit otherwise. A transfer stays within one visibility (ADR 0002),
 * never out of a card; paying a card is offered by its own action.
 */
export function TransferForm({
  actor,
  transfer,
  accounts,
  retiredAccounts,
  categories,
  draftAmount,
  onDirectionChange,
  onClose,
}: {
  actor: Actor;
  transfer?: TransferRow;
  /** The accounts in use. */
  accounts: AccountRow[];
  retiredAccounts: AccountRow[];
  categories: CategoryList;
  draftAmount?: string;
  /** Offered for a new entry, so it can become an expense or income, carrying the amount typed. */
  onDirectionChange?: (direction: ListType, amount: string) => void;
  onClose: () => void;
}) {
  const lastUsedAccountId = useQuickEntryStore((state) => state.lastUsed.accountId);
  const amountRef = useRef<HTMLInputElement>(null);
  useFocusNewEntry(amountRef, !transfer);
  const allAccounts = [...accounts, ...retiredAccounts];
  const accountNames = new Map(allAccounts.map((account) => [account.id, account.name]));
  // An existing transfer keeps its own accounts as choices, even a retired one or a card.
  const isOwn = (account: AccountRow) =>
    account.id === transfer?.fromAccountId || account.id === transfer?.toAccountId;
  const inUse = accounts.filter(
    (account) => !isCreditCard(account) && (!transfer || sameOwnership(account, transfer))
  );
  const fromChoices = [
    ...inUse,
    ...allAccounts.filter(
      (account) => account.id === transfer?.fromAccountId && !inUse.includes(account)
    ),
  ];

  const [fromId, setFromId] = useState(
    transfer?.fromAccountId ??
      fromChoices.find((account) => account.id === lastUsedAccountId)?.id ??
      fromChoices[0]?.id ??
      ""
  );
  const from = allAccounts.find((account) => account.id === fromId);
  const toChoices = allAccounts.filter(
    (account) =>
      account.id !== fromId &&
      from !== undefined &&
      sameOwnership(account, from) &&
      (isOwn(account) || (!account.retired && !isCreditCard(account)))
  );
  const [toId, setToId] = useState(transfer?.toAccountId ?? toChoices[0]?.id ?? "");
  // A new From starts To over, so an earlier choice doesn't come back unseen.
  const chooseFrom = (id: string) => {
    setFromId(id);
    setToId("");
  };
  // A destination of another visibility, or the same account, can't follow the change.
  const shownToId = toChoices.some((account) => account.id === toId)
    ? toId
    : (toChoices[0]?.id ?? "");
  const to = allAccounts.find((account) => account.id === shownToId);

  const envelopeGroups = envelopeChoices(categories, from, to, transfer?.envelope, accountNames);
  const [envelope, setEnvelope] = useState(
    transfer ? envelopeKey(transfer.envelope) : envelopeKey(UNASSIGNED_ENVELOPE)
  );
  const isEnvelopeChoice = (key: string) =>
    envelopeGroups.some((group) => group.choices.some((choice) => choice.key === key));
  const shownEnvelope = isEnvelopeChoice(envelope)
    ? envelope
    : (envelopeGroups[0]?.choices[0]?.key ?? "");

  const [error, saveAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const { input, status, error: readError } = readTransferForm(formData);
      if (readError !== null) return readError;
      try {
        if (transfer) {
          await editTransfer(actor, transfer.id, input);
          if (status !== transfer.status) await setTransferStatus(actor, transfer.id, status);
          toast.success("Transfer saved");
        } else {
          await addTransfer(actor, { ...input, status });
          toast.success("Transfer added");
        }
        onClose();
        return null;
      } catch (caught) {
        return errorMessage(caught, "Couldn't save the transfer.");
      }
    },
    null
  );

  const directionChoice = onDirectionChange && (
    <DirectionChoice
      value={TRANSFER_TYPE}
      withTransfer
      onChange={(next) =>
        next !== TRANSFER_TYPE && onDirectionChange(next, amountRef.current?.value ?? "")
      }
    />
  );

  if (fromChoices.length < 2 && !transfer) {
    return (
      <div className="space-y-4">
        {directionChoice}
        <p className="text-sm text-muted-foreground">
          A transfer needs two accounts in use, other than credit cards. Add another on Home.
        </p>
      </div>
    );
  }

  const remove = () => {
    if (!transfer) return;
    onClose();
    void removeTransferWithUndo(actor, transfer);
  };

  return (
    <form
      action={saveAction}
      className="space-y-4"
      aria-label={transfer ? "Edit transfer" : "Add transfer"}
    >
      <div className="grid gap-4 @[480px]:grid-cols-2">
        <div className={cn("space-y-2", onDirectionChange && FULL_ROW)}>
          <Label htmlFor="transfer-amount">Amount ({PESO_SIGN})</Label>
          <Input
            id="transfer-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            required
            ref={amountRef}
            defaultValue={transfer ? formatPHPInput(transfer.amountCents) : draftAmount}
          />
        </div>
        {directionChoice}
        <div className="space-y-2">
          <Label htmlFor="transfer-date">Date</Label>
          <Input
            id="transfer-date"
            name="date"
            type="date"
            required
            defaultValue={transfer?.date ?? format(new Date(), "yyyy-MM-dd")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="transfer-from">From</Label>
          <Select name="fromAccountId" value={fromId} onValueChange={chooseFrom}>
            <SelectTrigger id="transfer-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fromChoices.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {accountLabel(choice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transfer-to">To</Label>
          <Select name="toAccountId" value={shownToId} onValueChange={setToId}>
            <SelectTrigger id="transfer-to" className="w-full">
              <SelectValue placeholder="No other account" />
            </SelectTrigger>
            <SelectContent>
              {toChoices.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {accountLabel(choice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transfer-envelope">Category</Label>
          <Select name="envelope" value={shownEnvelope} onValueChange={setEnvelope}>
            <SelectTrigger id="transfer-envelope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {envelopeGroups.map((group) => (
                <SelectGroup key={group.label}>
                  {group.label !== "Unassigned" && <SelectLabel>{group.label}</SelectLabel>}
                  {group.choices.map((choice) => (
                    <SelectItem key={choice.key} value={choice.key}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transfer-description">Description (optional)</Label>
        <Input
          id="transfer-description"
          name="description"
          maxLength={DESCRIPTION_MAX_LENGTH}
          autoComplete="off"
          defaultValue={transfer?.description}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="transfer-notes">Notes (optional)</Label>
        <Textarea
          id="transfer-notes"
          name="notes"
          maxLength={NOTES_MAX_LENGTH}
          rows={2}
          defaultValue={transfer?.notes}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Status</legend>
        <RadioGroup
          name="status"
          defaultValue={transfer?.status ?? "cleared"}
          className="grid grid-cols-2 gap-2"
        >
          <ChoiceItem id="transfer-status-cleared" value="cleared" label="Cleared" />
          <ChoiceItem id="transfer-status-pending" value="pending" label="Pending" />
        </RadioGroup>
      </fieldset>

      <FormError>{error}</FormError>
      <DialogFooter className="gap-2 @[480px]:justify-between">
        {transfer ? (
          <Button type="button" variant="outline" onClick={remove}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton pendingText="Saving...">{transfer ? "Save" : "Add transfer"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
