import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { accountLabel } from "@/components/accounts/AccountSelect";
import { ActionForm } from "@/components/app/ActionForm";
import { Combobox, type ComboboxGroup, type ComboboxOption } from "@/components/app/Combobox";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { changeWithUndo } from "@/components/app/withUndo";
import { FormFooter, FormSheet, FULL_ROW } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Textarea } from "@/components/app/Textarea";
import { categoryNames, envelopeFromKey, envelopeKey } from "@/components/allocations/envelopes";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { envelopeLabel } from "@/lib/allocations/envelope";
import { sameEnvelope, UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
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
import type { Cents } from "@/lib/currency";
import { sameOwnership } from "@/lib/events/ownership";
import {
  DESCRIPTION_MAX_LENGTH,
  isTransactionStatus,
  NOTES_MAX_LENGTH,
  type TransactionStatus,
} from "@/lib/transactions/events";
import { TRANSFER_TYPE, type EntryDirection } from "@/lib/transactions/filter";
import { transferLabel } from "@/lib/transfers/events";
import type { TransferRow } from "@/lib/transfers/projection";
import { errorMessage } from "@/lib/utils";
import { todayLocalDate } from "@/lib/utils/dates";
import { useQuickEntryStore } from "@/stores/quickEntryStore";
import { confirmRemoval } from "./confirmRemoval";
import {
  AmountField,
  DirectionChoice,
  formProblem,
  hasFieldProblems,
  NO_PROBLEMS,
  readEntryBasics,
  StatusChoice,
  STATUSES,
  useFocusNewEntry,
  type EntryProblems,
} from "./EntryFields";
import { transferName } from "./transferName";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";

/**
 * Asks first, then removes the transfer, offering Undo (a restore event) in
 * the toast. Resolves whether it was removed.
 */
export async function removeTransferWithUndo(
  actor: Actor,
  transfer: TransferRow,
  name: string
): Promise<boolean> {
  if (!(await confirmRemoval(name, transfer.amountCents))) return false;
  return changeWithUndo({
    change: () => removeTransfer(actor, transfer.id),
    undo: () => restoreTransfer(actor, transfer.id),
    done: `Removed ${name || transferLabel(transfer)}`,
    failed: "Couldn't remove the transfer.",
    undoFailed: "Couldn't restore the transfer.",
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
    <FormSheet title="Edit transfer" onClose={onClose}>
      <TransferEditor actor={actor} transfer={transfer} onClose={onClose} />
    </FormSheet>
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

/**
 * Unassigned (the empty choice) and the categories in use the account's people hold
 * money in, plus the envelope the transfer already has (a retired category or a Card
 * Payment). Into a card, only its own Card Payment: that is paying it.
 */
function envelopeChoices(
  list: CategoryList,
  account: AccountRow | undefined,
  destination: AccountRow | undefined,
  current: Envelope | undefined,
  accountNames: Map<string, string>
): { empty?: ComboboxOption; groups: ComboboxGroup[] } {
  if (destination && isCreditCard(destination)) {
    const cardPayment: Envelope = { kind: "card_payment", id: destination.id };
    const label = envelopeLabel(cardPayment, new Map(), accountNames);
    return {
      groups: [{ label: "Card Payment", options: [{ value: envelopeKey(cardPayment), label }] }],
    };
  }
  const empty = { value: envelopeKey(UNASSIGNED_ENVELOPE), label: "Unassigned" };
  const fits = (category: CategoryRow) =>
    account !== undefined && canHoldMoneyIn(category, account);
  const toOption = (category: CategoryRow) => ({
    value: envelopeKey({ kind: "category", id: category.id }),
    label: category.name,
  });
  const groups = [
    ...list.groups.map((group) => ({
      label: group.name,
      options: group.categories.filter(fits).map(toOption),
    })),
    { label: "Ungrouped", options: list.ungrouped.filter(fits).map(toOption) },
  ];
  const offered = new Set(
    [empty, ...groups.flatMap((group) => group.options)].map((option) => option.value)
  );
  if (current && !offered.has(envelopeKey(current))) {
    groups.push({
      label: "Current",
      options: [
        {
          value: envelopeKey(current),
          label: envelopeLabel(current, categoryNames(list), accountNames),
        },
      ],
    });
  }
  return { empty, groups: groups.filter((group) => group.options.length > 0) };
}

type EnvelopeChoices = ReturnType<typeof envelopeChoices>;

/** The chosen envelope while it is still offered, else the first choice. */
function shownChoice(choices: EnvelopeChoices, key: string): string {
  const offered =
    key === choices.empty?.value ||
    choices.groups.some((group) => group.options.some((option) => option.value === key));
  return offered ? key : (choices.empty?.value ?? choices.groups[0]?.options[0]?.value ?? "");
}

type ReadForm =
  | { input: TransferInput; status: TransactionStatus; problems: null }
  | { input: null; status: null; problems: EntryProblems };

function readTransferForm(formData: FormData): ReadForm {
  const { amountCents, date, fields } = readEntryBasics(formData);
  if (hasFieldProblems(fields)) {
    return { input: null, status: null, problems: { fields, form: null } };
  }
  const fromEnvelope = envelopeFromKey(String(formData.get("fromEnvelope") ?? ""));
  if (!fromEnvelope) {
    return { input: null, status: null, problems: formProblem("Choose a category or Unassigned.") };
  }
  // With no arrival field, the money arrives in the envelope it left.
  const arrival = formData.get("toEnvelope");
  const toEnvelope = arrival === null ? fromEnvelope : envelopeFromKey(String(arrival));
  if (!toEnvelope) {
    return {
      input: null,
      status: null,
      problems: formProblem("Choose the category the money goes to, or Unassigned."),
    };
  }
  const status = formData.get("status");
  return {
    input: {
      date,
      amountCents,
      fromAccountId: String(formData.get("fromAccountId") ?? ""),
      toAccountId: String(formData.get("toAccountId") ?? ""),
      fromEnvelope,
      toEnvelope,
      description: String(formData.get("description") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    },
    status: isTransactionStatus(status) ? status : "cleared",
    problems: null,
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
  draftAmount?: Cents;
  /** Offered for a new entry, so it can become an expense or income, carrying the amount typed. */
  onDirectionChange?: (direction: EntryDirection, amount: Cents | undefined) => void;
  onClose: () => void;
}) {
  const lastUsedAccountId = useQuickEntryStore((state) => state.lastUsed.accountId);
  const [amount, setAmount] = useState(transfer?.amountCents ?? draftAmount);
  const [statusChoice, setStatusChoice] = useState<TransactionStatus>(
    transfer?.status ?? "cleared"
  );
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

  const envelopes = envelopeChoices(categories, from, to, transfer?.fromEnvelope, accountNames);
  const [envelope, setEnvelope] = useState(
    transfer ? envelopeKey(transfer.fromEnvelope) : envelopeKey(UNASSIGNED_ENVELOPE)
  );
  const shownEnvelope = shownChoice(envelopes, envelope);

  // Into a card, or out of a Card Payment, the money arrives in the Card Payment it left.
  const arrivesAsLeft =
    (to !== undefined && isCreditCard(to)) ||
    envelopeFromKey(shownEnvelope)?.kind === "card_payment";
  const arrivals = envelopeChoices(categories, to, to, transfer?.toEnvelope, accountNames);
  // Null while the arrival follows the leaving envelope; the member's choice once made.
  const [arrival, setArrival] = useState(
    transfer && !sameEnvelope(transfer.fromEnvelope, transfer.toEnvelope)
      ? envelopeKey(transfer.toEnvelope)
      : null
  );
  const shownArrival = shownChoice(arrivals, arrival ?? shownEnvelope);

  const [problems, saveAction] = useActionState(
    async (_previous: EntryProblems, formData: FormData) => {
      const { input, status, problems: readProblems } = readTransferForm(formData);
      if (readProblems !== null) return readProblems;
      try {
        if (transfer) {
          const edited = await editTransfer(actor, transfer.id, input);
          const statusChanged = status !== transfer.status;
          if (statusChanged) await setTransferStatus(actor, transfer.id, status);
          if (edited || statusChanged) toast.success("Transfer saved");
        } else {
          await addTransfer(actor, { ...input, status });
          toast.success("Transfer added");
        }
        onClose();
        return NO_PROBLEMS;
      } catch (caught) {
        return formProblem(errorMessage(caught, "Couldn't save the transfer."));
      }
    },
    NO_PROBLEMS
  );
  const formRef = useFocusFirstProblem(problems);

  const directionChoice = onDirectionChange && (
    <DirectionChoice
      value={TRANSFER_TYPE}
      withTransfer
      onChange={(next) => next !== TRANSFER_TYPE && onDirectionChange(next, amount)}
    />
  );

  if (fromChoices.length < 2 && !transfer) {
    return (
      <div className="space-y-4">
        {directionChoice}
        <p className="text-body text-muted-foreground">
          A transfer needs two accounts in use, other than credit cards. Add another on Home.
        </p>
      </div>
    );
  }

  const remove = async () => {
    if (!transfer) return;
    const accountNameOf = (id: string) =>
      allAccounts.find((account) => account.id === id)?.name ?? "";
    const name = transferName(transfer, accountNameOf, null);
    if (await removeTransferWithUndo(actor, transfer, name)) onClose();
  };

  return (
    <ActionForm
      ref={formRef}
      action={saveAction}
      noValidate
      className="space-y-4"
      aria-label={transfer ? "Edit transfer" : "Add transfer"}
    >
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <AmountField
          value={amount}
          onChange={setAmount}
          error={problems.fields.amount}
          inputRef={amountRef}
          className={onDirectionChange && FULL_ROW}
        />
        {directionChoice}
        <Field label="Date" error={problems.fields.date}>
          <Input
            name="date"
            type="date"
            required
            defaultValue={transfer?.date ?? todayLocalDate()}
          />
        </Field>
        <Field label="From">
          {(control) => (
            <Select name="fromAccountId" value={fromId} onValueChange={chooseFrom}>
              <SelectTrigger {...control} className="w-full">
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
          )}
        </Field>
        <Field label="To">
          {(control) => (
            <Select name="toAccountId" value={shownToId} onValueChange={setToId}>
              <SelectTrigger {...control} className="w-full">
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
          )}
        </Field>
        <Field label={envelopes.empty ? "From category (optional)" : "From category"}>
          {(control) => (
            <Combobox
              {...control}
              name="fromEnvelope"
              className="w-full"
              value={shownEnvelope}
              onValueChange={setEnvelope}
              empty={envelopes.empty}
              groups={envelopes.groups}
            />
          )}
        </Field>
        {!arrivesAsLeft && (
          <Field label="To category (optional)">
            {(control) => (
              <Combobox
                {...control}
                name="toEnvelope"
                className="w-full"
                value={shownArrival}
                onValueChange={setArrival}
                empty={arrivals.empty}
                groups={arrivals.groups}
              />
            )}
          </Field>
        )}
      </div>

      <Field label="Description (optional)">
        <Input
          name="description"
          maxLength={DESCRIPTION_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="next"
          defaultValue={transfer?.description}
        />
      </Field>
      <Field label="Notes (optional)">
        <Textarea
          name="notes"
          maxLength={NOTES_MAX_LENGTH}
          rows={2}
          defaultValue={transfer?.notes}
        />
      </Field>

      <StatusChoice value={statusChoice} onChange={setStatusChoice} options={STATUSES} />

      <FormError>{problems.form}</FormError>
      <FormFooter destructive={transfer && { label: "Remove", onClick: () => void remove() }}>
        <SubmitButton pendingText="Saving...">{transfer ? "Save" : "Add transfer"}</SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}
