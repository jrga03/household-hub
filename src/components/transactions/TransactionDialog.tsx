import { useActionState, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
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
import { formatPHPInput, type Cents } from "@/lib/currency";
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
import { errorMessage } from "@/lib/utils";
import { todayLocalDate } from "@/lib/utils/dates";
import { useQuickEntryStore } from "@/stores/quickEntryStore";
import {
  AmountField,
  DirectionChoice,
  formProblem,
  hasFieldProblems,
  NO_PROBLEMS,
  readEntryBasics,
  StatusChoice,
  useFocusNewEntry,
  type EntryProblems,
} from "./EntryFields";
import { categoryChoices, CategorySelect, isCategoryChoice, UNASSIGNED } from "./CategorySelect";
import { removeWithUndo } from "./removeWithUndo";
import { TransferForm } from "./TransferDialog";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";

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
  const [draft, setDraft] = useState<{ direction: EntryDirection; amount: Cents | undefined }>({
    direction: "expense",
    amount: undefined,
  });
  const switchTo = (direction: EntryDirection, amount: Cents | undefined) =>
    setDraft({ direction, amount });
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
  | { input: TransactionInput; status: TransactionStatus; problems: null }
  | { input: null; status: null; problems: EntryProblems };

function readTransactionForm(formData: FormData): ReadForm {
  const { amountCents, date, fields } = readEntryBasics(formData);
  const description = String(formData.get("description") ?? "");
  if (description.trim() === "") fields.description = "Add a description.";
  if (hasFieldProblems(fields)) {
    return { input: null, status: null, problems: { fields, form: null } };
  }
  const categoryId = String(formData.get("categoryId") ?? UNASSIGNED);
  const status = formData.get("status");
  return {
    input: {
      date,
      type: String(formData.get("type") ?? ""),
      amountCents,
      accountId: String(formData.get("accountId") ?? ""),
      categoryId: categoryId === UNASSIGNED ? null : categoryId,
      description,
      notes: String(formData.get("notes") ?? ""),
    },
    status: isTransactionStatus(status) ? status : "cleared",
    problems: null,
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
  draftAmount?: Cents;
  accounts: AccountRow[];
  categories: CategoryList;
  /** Offered for a new entry, so it can become a transfer, carrying the amount typed. */
  onDirectionChange?: (direction: EntryDirection, amount: Cents | undefined) => void;
  onClose: () => void;
}) {
  const { lastUsed, setLastUsed } = useQuickEntryStore();
  const navigate = useNavigate();
  const lastAccount = accounts.find((account) => account.id === lastUsed.accountId);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? initialType);
  const [amount, setAmount] = useState(transaction?.amountCents ?? draftAmount);
  const [statusChoice, setStatusChoice] = useState<TransactionStatus>(
    transaction?.status ?? "cleared"
  );
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

  const [problems, saveAction] = useActionState(
    async (_previous: EntryProblems, formData: FormData) => {
      const { input, status, problems: readProblems } = readTransactionForm(formData);
      if (readProblems !== null) return readProblems;
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
                      to: "/assign-money",
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
        return NO_PROBLEMS;
      } catch (caught) {
        return formProblem(errorMessage(caught, "Couldn't save the transaction."));
      }
    },
    NO_PROBLEMS
  );
  const formRef = useFocusFirstProblem(problems);

  const remove = async () => {
    if (transaction && (await removeWithUndo(actor, transaction))) onClose();
  };

  return (
    <ActionForm
      ref={formRef}
      action={saveAction}
      noValidate
      className="space-y-4"
      aria-label={transaction ? "Edit transaction" : "Add transaction"}
    >
      {/* The amount comes first, so the dialog opens with it focused. */}
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <AmountField
          value={amount}
          onChange={setAmount}
          error={problems.fields.amount}
          inputRef={amountRef}
          className={onDirectionChange && FULL_ROW}
        />
        <DirectionChoice
          value={type}
          withTransfer={onDirectionChange !== undefined}
          onChange={(next) => {
            if (next === TRANSFER_TYPE) {
              onDirectionChange?.(next, amount);
              return;
            }
            setType(next);
            // New money lands in Unassigned unless the member names a category.
            if (next === "income" && !transaction) setCategoryId(UNASSIGNED);
          }}
        />
        <Field label="Date" error={problems.fields.date}>
          <Input
            name="date"
            type="date"
            required
            defaultValue={transaction?.date ?? todayLocalDate()}
          />
        </Field>
        <Field label="Account">
          {(control) => (
            <Select name="accountId" value={accountId} onValueChange={setAccountId}>
              <SelectTrigger {...control} className="w-full">
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
          )}
        </Field>
        <Field label="Category (optional)">
          {(control) => (
            <CategorySelect
              {...control}
              name="categoryId"
              choices={choices}
              value={shownCategoryId}
              onValueChange={setCategoryId}
            />
          )}
        </Field>
      </div>

      <Field label="Description" error={problems.fields.description}>
        <Input
          name="description"
          required
          maxLength={DESCRIPTION_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="next"
          defaultValue={transaction?.description}
        />
      </Field>
      <Field label="Notes (optional)">
        <Textarea
          name="notes"
          maxLength={NOTES_MAX_LENGTH}
          rows={2}
          defaultValue={transaction?.notes}
        />
      </Field>

      <StatusChoice value={statusChoice} onChange={setStatusChoice} />

      <FormError>{problems.form}</FormError>
      <FormFooter destructive={transaction && { label: "Remove", onClick: () => void remove() }}>
        <SubmitButton pendingText="Saving...">
          {transaction ? "Save" : "Add transaction"}
        </SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}
