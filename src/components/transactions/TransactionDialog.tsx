import { useActionState, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ListPlusIcon } from "lucide-react";
import { AccountSelect } from "@/components/accounts/AccountSelect";
import { ActionForm, useActionFormPending } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { FormFooter, FormSheet, FULL_ROW } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Textarea } from "@/components/app/Textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/app/Tooltip";
import { MoveMoneyForm } from "@/components/moves/MoveMoneyDialog";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useMemberNames } from "@/hooks/useMemberNames";
import { canBeOutOfPocket, isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  addTransaction,
  editTransaction,
  setTransactionStatus,
  type PaidFromInput,
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
import { MOVE_DIRECTION, type EntryDirection } from "@/lib/transactions/filter";
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
  saveEditAndStatus,
  StatusChoice,
  STATUSES,
  useFocusNewEntry,
  type EntryProblems,
} from "./EntryFields";
import { categoryChoices, CategorySelect, isCategoryChoice, UNASSIGNED } from "./CategorySelect";
import { PaidFromLine } from "./PaidFromSelect";
import { removeWithUndo } from "./removeWithUndo";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";

const OUT_OF_POCKET = "out-of-pocket";
/** A status, or Out-of-pocket: pending, paid by the member recording it (ADR 0012). */
type StatusChoiceValue = TransactionStatus | typeof OUT_OF_POCKET;

const STATUSES_WITH_OUT_OF_POCKET = [
  ...STATUSES,
  { value: OUT_OF_POCKET, label: "Out-of-pocket" },
] as const satisfies readonly { value: StatusChoiceValue; label: string }[];

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
  const [moving, setMoving] = useState(false);
  const title = transaction ? "Edit transaction" : moving ? "Move money" : "Add transaction";
  return (
    <FormSheet title={title} onClose={onClose}>
      <TransactionEditor
        actor={actor}
        transaction={transaction}
        onMovingChange={setMoving}
        onClose={onClose}
      />
    </FormSheet>
  );
}

/** The form alone, for the dialog and the wide-screen detail pane. */
export function TransactionEditor({
  actor,
  transaction,
  onMovingChange,
  onClose,
}: {
  actor: Actor;
  transaction?: TransactionRow;
  /** Told when a new entry switches to or from Move money, so the title can follow. */
  onMovingChange?: (moving: boolean) => void;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  if (!accounts || !retiredAccounts || !categories) return null;

  // A transaction moves only within its visibility; its own account stays a choice even when retired.
  // An out-of-pocket expense moves only to an account that can pay it back (ADR 0012).
  const accountChoices = transaction
    ? [
        ...accounts.filter(
          (account) =>
            sameOwnership(account, transaction) &&
            (transaction.paidByUserId === null || canBeOutOfPocket(account))
        ),
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
      categories={categories}
      onMovingChange={onMovingChange}
      onClose={onClose}
    />
  );
}

/** A new entry is an expense, income or a move; switching to or from Move money swaps the form. */
function NewEntryForm({
  actor,
  accounts,
  categories,
  onMovingChange,
  onClose,
}: {
  actor: Actor;
  accounts: AccountRow[];
  categories: CategoryList;
  onMovingChange?: (moving: boolean) => void;
  onClose: () => void;
}) {
  // The amount typed so far follows a switch between forms.
  const [draft, setDraft] = useState<{ direction: EntryDirection; amount: Cents | undefined }>({
    direction: "expense",
    amount: undefined,
  });
  const switchTo = (direction: EntryDirection, amount: Cents | undefined) => {
    setDraft({ direction, amount });
    onMovingChange?.(direction === MOVE_DIRECTION);
  };
  const { direction } = draft;
  if (direction === MOVE_DIRECTION) {
    return (
      <MoveMoneyForm
        actor={actor}
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
  | { input: PaidFromInput; status: TransactionStatus; outOfPocket: boolean; problems: null }
  | { input: null; status: null; outOfPocket: null; problems: EntryProblems };

function readTransactionForm(formData: FormData): ReadForm {
  const { amountCents, date, fields } = readEntryBasics(formData);
  const description = String(formData.get("description") ?? "");
  if (description.trim() === "") fields.description = "Add a description.";
  if (hasFieldProblems(fields)) {
    return { input: null, status: null, outOfPocket: null, problems: { fields, form: null } };
  }
  const categoryId = String(formData.get("categoryId") ?? UNASSIGNED);
  const status = formData.get("status");
  const payingAccountId = formData.get("payingAccountId");
  return {
    input: {
      date,
      type: String(formData.get("type") ?? ""),
      amountCents,
      accountId: String(formData.get("accountId") ?? ""),
      categoryId: categoryId === UNASSIGNED ? null : categoryId,
      description,
      notes: String(formData.get("notes") ?? ""),
      payingAccountId: typeof payingAccountId === "string" ? payingAccountId : undefined,
    },
    status: status === OUT_OF_POCKET ? "pending" : isTransactionStatus(status) ? status : "cleared",
    outOfPocket: status === OUT_OF_POCKET,
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
  const nameOf = useMemberNames(actor.householdId, actor.userId);
  const payer = transaction?.paidByUserId;
  const payerHint = payer ? `Out-of-pocket, paid by ${nameOf(payer)}` : undefined;
  const lastAccount = accounts.find((account) => account.id === lastUsed.accountId);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? initialType);
  const [amount, setAmount] = useState(transaction?.amountCents ?? draftAmount);
  const [statusChoice, setStatusChoice] = useState<StatusChoiceValue>(
    transaction?.status ?? "cleared"
  );
  const amountRef = useRef<HTMLInputElement>(null);
  useFocusNewEntry(amountRef, !transaction);
  // Each "Add and start another" save remounts the cleared fields.
  const startAnother = useRef(false);
  const [entryCount, setEntryCount] = useState(0);
  useEffect(() => {
    if (entryCount > 0) amountRef.current?.focus();
  }, [entryCount]);
  const [accountId, setAccountId] = useState(
    transaction?.accountId ?? lastAccount?.id ?? accounts[0]?.id ?? ""
  );
  const account = accounts.find((choice) => choice.id === accountId);
  // Paid from, chosen for one card; another card starts at its own usual account.
  const [paidFrom, setPaidFrom] = useState<{ cardId: string; accountId: string }>();
  const card = transaction && account && isCreditCard(account) ? account : undefined;
  const paidFromId = !card
    ? null
    : paidFrom?.cardId === card.id
      ? paidFrom.accountId
      : card.id === transaction?.accountId
        ? transaction.payingAccountId
        : card.payingAccountId;
  const offerOutOfPocket =
    !transaction && type === "expense" && account !== undefined && canBeOutOfPocket(account);
  if (statusChoice === OUT_OF_POCKET && !offerOutOfPocket) setStatusChoice("pending");
  const choices = categoryChoices(categories, account, transaction?.categoryId ?? null);
  const isChoice = (id: string | null) => isCategoryChoice(choices, id);
  // A new transaction lands in Unassigned unless the member names a category.
  const [categoryId, setCategoryId] = useState(() => {
    const own = transaction?.categoryId ?? null;
    return own !== null && isChoice(own) ? own : UNASSIGNED;
  });
  // A category of another visibility can't follow the account change.
  const shownCategoryId =
    categoryId === UNASSIGNED || isChoice(categoryId) ? categoryId : UNASSIGNED;

  const [problems, saveAction] = useActionState(
    async (_previous: EntryProblems, formData: FormData) => {
      const another = startAnother.current;
      startAnother.current = false;
      const { input, status, outOfPocket, problems: readProblems } = readTransactionForm(formData);
      if (readProblems !== null) return readProblems;
      try {
        if (transaction) {
          await saveEditAndStatus({
            edit: () => editTransaction(actor, transaction.id, input),
            status,
            previousStatus: transaction.status,
            setStatus: (changed) => setTransactionStatus(actor, transaction.id, changed),
            saved: "Transaction saved",
          });
        } else {
          await addTransaction(actor, {
            ...input,
            status,
            paidByUserId: outOfPocket ? actor.userId : null,
          });
          setLastUsed({ accountId: input.accountId });
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
          if (another) {
            setAmount(undefined);
            setEntryCount((count) => count + 1);
            return NO_PROBLEMS;
          }
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
          key={entryCount}
          value={amount}
          onChange={setAmount}
          error={problems.fields.amount}
          inputRef={amountRef}
          className={onDirectionChange && FULL_ROW}
        />
        <DirectionChoice
          value={type}
          withMove={onDirectionChange !== undefined}
          onChange={(next) => {
            if (next === MOVE_DIRECTION) {
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
            <AccountSelect
              {...control}
              name="accountId"
              accounts={accounts}
              value={accountId}
              onValueChange={setAccountId}
            />
          )}
        </Field>
        {card && (
          <PaidFromLine
            card={card}
            value={paidFromId}
            onChange={(chosen) => setPaidFrom({ cardId: card.id, accountId: chosen })}
            className={FULL_ROW}
          />
        )}
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
          key={entryCount}
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
          key={entryCount}
          name="notes"
          maxLength={NOTES_MAX_LENGTH}
          rows={2}
          defaultValue={transaction?.notes}
        />
      </Field>

      <StatusChoice
        value={statusChoice}
        onChange={setStatusChoice}
        options={offerOutOfPocket ? STATUSES_WITH_OUT_OF_POCKET : STATUSES}
        hint={payerHint}
      />

      <FormError>{problems.form}</FormError>
      {transaction ? (
        <FormFooter destructive={{ label: "Remove", onClick: () => void remove() }}>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </FormFooter>
      ) : (
        // One row on phones too: the icon button beside a primary that fills the rest.
        <FormFooter className="flex-row">
          <AddAnotherButton onClick={() => (startAnother.current = true)} />
          <SubmitButton pendingText="Saving…" className="flex-1 @[480px]:flex-none">
            Add transaction
          </SubmitButton>
        </FormFooter>
      )}
    </ActionForm>
  );
}

/** Saves like the submit button but keeps the sheet open. Not a submit button, so Enter skips it. */
function AddAnotherButton({ onClick }: { onClick: () => void }) {
  const pending = useActionFormPending();
  const label = "Add and start another";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={label}
          disabled={pending}
          onClick={(event) => {
            onClick();
            event.currentTarget.form?.requestSubmit();
          }}
        >
          <ListPlusIcon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
