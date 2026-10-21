import { useActionState, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/app/FormSheet";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  addTransaction,
  editTransaction,
  setTransactionStatus,
  type TransactionInput,
} from "@/lib/commands/transactions";
import { formatPHPInput, parsePHPSafe, PESO_SIGN } from "@/lib/currency";
import { sameOwnership } from "@/lib/events/ownership";
import {
  DESCRIPTION_MAX_LENGTH,
  isTransactionStatus,
  NOTES_MAX_LENGTH,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/transactions/events";
import type { TransactionRow } from "@/lib/transactions/projection";
import { TRANSFER_TYPE, type EntryDirection } from "@/lib/transactions/filter";
import { cn, errorMessage } from "@/lib/utils";
import { useQuickEntryStore } from "@/stores/quickEntryStore";
import { ChoiceItem, DirectionChoice, FULL_ROW, useFocusNewEntry } from "./EntryFields";
import { categoryChoices, CategorySelect, isCategoryChoice, UNASSIGNED } from "./CategorySelect";
import { removeWithUndo } from "./removeWithUndo";
import { TransferForm } from "./TransferDialog";
import { todayLocalDate } from "@/lib/utils/dates";

/** Add when `transaction` is left out; edit otherwise. */
export function TransactionDialog({
  actor,
  transaction,
  onClose,
}: {
  actor: Actor;
  transaction?: TransactionRow;
  onClose: () => void;
}) {
  return (
    <FormSheet title={transaction ? "Edit transaction" : "Add transaction"} onClose={onClose}>
      <TransactionEditor actor={actor} transaction={transaction} onClose={onClose} />
    </FormSheet>
  );
}

/** The form alone, for the dialog and the wide-screen detail pane. */
export function TransactionEditor({
  actor,
  transaction,
  onClose,
}: {
  actor: Actor;
  transaction?: TransactionRow;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  if (!accounts || !retiredAccounts || !categories) return null;

  // A transaction moves only within its visibility; its own account stays a choice even when retired.
  const accountChoices = transaction
    ? [
        ...accounts.filter((account) => sameOwnership(account, transaction)),
        ...retiredAccounts.filter((account) => account.id === transaction.accountId),
      ]
    : accounts;

  if (accountChoices.length === 0) {
    return <p className="text-body text-muted-foreground">Add an account on Accounts first.</p>;
  }
  if (transaction) {
    return (
      <TransactionForm
        actor={actor}
        transaction={transaction}
        accounts={accountChoices}
        categories={categories}
        onClose={onClose}
      />
    );
  }
  return (
    <NewEntryForm
      actor={actor}
      accounts={accountChoices}
      retiredAccounts={retiredAccounts}
      categories={categories}
      onClose={onClose}
    />
  );
}

/** A new entry is an expense, income or a transfer; switching to or from Transfer swaps the form. */
function NewEntryForm({
  actor,
  accounts,
  retiredAccounts,
  categories,
  onClose,
}: {
  actor: Actor;
  accounts: AccountRow[];
  retiredAccounts: AccountRow[];
  categories: CategoryList;
  onClose: () => void;
}) {
  // The amount typed so far follows a switch between forms.
  const [draft, setDraft] = useState<{ direction: EntryDirection; amount: string }>({
    direction: "expense",
    amount: "",
  });
  const switchTo = (direction: EntryDirection, amount: string) => setDraft({ direction, amount });
  const { direction } = draft;
  if (direction === TRANSFER_TYPE) {
    return (
      <TransferForm
        actor={actor}
        accounts={accounts}
        retiredAccounts={retiredAccounts}
        categories={categories}
        draftAmount={draft.amount}
        onDirectionChange={switchTo}
        onClose={onClose}
      />
    );
  }
  return (
    <TransactionForm
      key={direction}
      actor={actor}
      initialType={direction}
      accounts={accounts}
      categories={categories}
      draftAmount={draft.amount}
      onDirectionChange={switchTo}
      onClose={onClose}
    />
  );
}

type ReadForm =
  | { input: TransactionInput; status: TransactionStatus; error: null }
  | { input: null; status: null; error: string };

function readTransactionForm(formData: FormData): ReadForm {
  const amount = parsePHPSafe(String(formData.get("amount") ?? ""));
  if (!amount.success) return { input: null, status: null, error: amount.error.message };
  const categoryId = String(formData.get("categoryId") ?? UNASSIGNED);
  const status = formData.get("status");
  return {
    input: {
      date: String(formData.get("date") ?? ""),
      type: String(formData.get("type") ?? ""),
      amountCents: amount.value,
      accountId: String(formData.get("accountId") ?? ""),
      categoryId: categoryId === UNASSIGNED ? null : categoryId,
      description: String(formData.get("description") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    },
    status: isTransactionStatus(status) ? status : "cleared",
    error: null,
  };
}

function TransactionForm({
  actor,
  transaction,
  initialType = "expense",
  draftAmount,
  accounts,
  categories,
  onDirectionChange,
  onClose,
}: {
  actor: Actor;
  transaction?: TransactionRow;
  initialType?: TransactionType;
  draftAmount?: string;
  accounts: AccountRow[];
  categories: CategoryList;
  /** Offered for a new entry, so it can become a transfer, carrying the amount typed. */
  onDirectionChange?: (direction: EntryDirection, amount: string) => void;
  onClose: () => void;
}) {
  const { lastUsed, setLastUsed } = useQuickEntryStore();
  const navigate = useNavigate();
  const lastAccount = accounts.find((account) => account.id === lastUsed.accountId);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? initialType);
  const amountRef = useRef<HTMLInputElement>(null);
  useFocusNewEntry(amountRef, !transaction);
  const [accountId, setAccountId] = useState(
    transaction?.accountId ?? lastAccount?.id ?? accounts[0]?.id ?? ""
  );
  const account = accounts.find((choice) => choice.id === accountId);
  const choices = categoryChoices(categories, account, transaction?.categoryId ?? null);
  const isChoice = (id: string | null) => isCategoryChoice(choices, id);
  const [categoryId, setCategoryId] = useState(() => {
    // New money lands in Unassigned unless the member names a category.
    const preferred = transaction
      ? transaction.categoryId
      : type === "income"
        ? null
        : lastUsed.categoryId;
    return preferred !== null && isChoice(preferred) ? preferred : UNASSIGNED;
  });
  // A category of another visibility can't follow the account change.
  const shownCategoryId =
    categoryId === UNASSIGNED || isChoice(categoryId) ? categoryId : UNASSIGNED;

  const [error, saveAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const { input, status, error: readError } = readTransactionForm(formData);
      if (readError !== null) return readError;
      try {
        if (transaction) {
          await editTransaction(actor, transaction.id, input);
          if (status !== transaction.status) {
            await setTransactionStatus(actor, transaction.id, status);
          }
          toast.success("Transaction saved");
        } else {
          await addTransaction(actor, { ...input, status });
          setLastUsed({ accountId: input.accountId, categoryId: input.categoryId });
          // Income into Unassigned is a payday: offer to split it across the budgets.
          const distribute =
            input.type === "income" && input.categoryId === null
              ? {
                  label: "Distribute",
                  onClick: () =>
                    void navigate({
                      to: "/plan",
                      search: {
                        distribute: "income",
                        account: input.accountId,
                        amount: formatPHPInput(input.amountCents),
                        date: input.date,
                      },
                    }),
                }
              : undefined;
          toast.success("Transaction added", { action: distribute });
        }
        onClose();
        return null;
      } catch (caught) {
        return errorMessage(caught, "Couldn't save the transaction.");
      }
    },
    null
  );

  const remove = async () => {
    if (transaction && (await removeWithUndo(actor, transaction))) onClose();
  };

  return (
    <ActionForm
      ref={advanceOnEnter}
      action={saveAction}
      className="space-y-4"
      aria-label={transaction ? "Edit transaction" : "Add transaction"}
    >
      {/* The amount comes first, so the dialog opens with it focused. */}
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <div className={cn("space-y-2", onDirectionChange && FULL_ROW)}>
          <Label htmlFor="transaction-amount">Amount ({PESO_SIGN})</Label>
          <Input
            id="transaction-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="next"
            required
            ref={amountRef}
            defaultValue={transaction ? formatPHPInput(transaction.amountCents) : draftAmount}
          />
        </div>
        <DirectionChoice
          value={type}
          withTransfer={onDirectionChange !== undefined}
          onChange={(next) => {
            if (next === TRANSFER_TYPE) {
              onDirectionChange?.(next, amountRef.current?.value ?? "");
              return;
            }
            setType(next);
            // New money lands in Unassigned unless the member names a category.
            if (next === "income" && !transaction) setCategoryId(UNASSIGNED);
          }}
        />
        <div className="space-y-2">
          <Label htmlFor="transaction-date">Date</Label>
          <Input
            id="transaction-date"
            name="date"
            type="date"
            required
            defaultValue={transaction?.date ?? todayLocalDate()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="transaction-account">Account</Label>
          <Select name="accountId" value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="transaction-account" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {choice.name}
                  {choice.visibility === "personal" && " (Personal)"}
                  {choice.retired && " (retired)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transaction-category">Category</Label>
          <CategorySelect
            id="transaction-category"
            name="categoryId"
            choices={choices}
            value={shownCategoryId}
            onValueChange={setCategoryId}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction-description">Description</Label>
        <Input
          id="transaction-description"
          name="description"
          required
          maxLength={DESCRIPTION_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="next"
          defaultValue={transaction?.description}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="transaction-notes">Notes (optional)</Label>
        <Textarea
          id="transaction-notes"
          name="notes"
          maxLength={NOTES_MAX_LENGTH}
          rows={2}
          defaultValue={transaction?.notes}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-label">Status</legend>
        <RadioGroup
          name="status"
          defaultValue={transaction?.status ?? "cleared"}
          className="grid grid-cols-2 gap-2"
        >
          <ChoiceItem id="transaction-status-cleared" value="cleared" label="Cleared" />
          <ChoiceItem id="transaction-status-pending" value="pending" label="Pending" />
        </RadioGroup>
      </fieldset>

      <FormError>{error}</FormError>
      <FormFooter destructive={transaction && { label: "Remove", onClick: () => void remove() }}>
        <SubmitButton pendingText="Saving...">
          {transaction ? "Save" : "Add transaction"}
        </SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}
