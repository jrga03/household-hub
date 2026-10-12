import { useActionState, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import type { AccountRow } from "@/lib/accounts/projection";
import type { CategoryList, CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  addTransaction,
  editTransaction,
  setTransactionStatus,
  type TransactionInput,
} from "@/lib/commands/transactions";
import { formatPHPInput, parsePHPSafe, PESO_SIGN } from "@/lib/currency";
import type { Ownership } from "@/lib/events/log";
import {
  DESCRIPTION_MAX_LENGTH,
  isTransactionStatus,
  isTransactionType,
  NOTES_MAX_LENGTH,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/transactions/events";
import type { TransactionRow } from "@/lib/transactions/projection";
import { errorMessage } from "@/lib/utils";
import { useQuickEntryStore } from "@/stores/quickEntryStore";
import { removeWithUndo } from "./removeWithUndo";

// Radix Select can't hold an empty value.
const UNASSIGNED = "unassigned";

const sameOwnership = (a: Ownership, b: Ownership) =>
  a.visibility === b.visibility && a.ownerUserId === b.ownerUserId;

interface CategoryChoiceGroup {
  label: string;
  categories: CategoryRow[];
}

/** Categories in use seen by the account's people, by group, plus a retired one the transaction already has. */
function categoryChoices(
  list: CategoryList,
  account: AccountRow | undefined,
  currentId: string | null
): CategoryChoiceGroup[] {
  if (!account) return [];
  const fits = (category: CategoryRow) => sameOwnership(category, account);
  const groups = [
    ...list.groups.map((group) => ({
      label: group.name,
      categories: group.categories.filter(fits),
    })),
    { label: "Ungrouped", categories: list.ungrouped.filter(fits) },
    {
      label: "Retired",
      categories: list.retiredCategories.filter(
        (category) => category.id === currentId && fits(category)
      ),
    },
  ];
  return groups.filter((group) => group.categories.length > 0);
}

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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="@container max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            Saved on this device at once; it reaches others when they sync.
          </DialogDescription>
        </DialogHeader>
        {accountChoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add an account on Home first.</p>
        ) : (
          <TransactionForm
            actor={actor}
            transaction={transaction}
            accounts={accountChoices}
            categories={categories}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
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
  accounts,
  categories,
  onClose,
}: {
  actor: Actor;
  transaction?: TransactionRow;
  accounts: AccountRow[];
  categories: CategoryList;
  onClose: () => void;
}) {
  const { lastUsed, setLastUsed } = useQuickEntryStore();
  const lastAccount = accounts.find((account) => account.id === lastUsed.accountId);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "expense");
  const [accountId, setAccountId] = useState(
    transaction?.accountId ?? lastAccount?.id ?? accounts[0]?.id ?? ""
  );
  const account = accounts.find((choice) => choice.id === accountId);
  const choices = categoryChoices(categories, account, transaction?.categoryId ?? null);
  const isChoice = (id: string | null) =>
    choices.some((group) => group.categories.some((category) => category.id === id));
  const [categoryId, setCategoryId] = useState(() => {
    const preferred = transaction ? transaction.categoryId : lastUsed.categoryId;
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
          toast.success("Transaction added");
        }
        onClose();
        return null;
      } catch (caught) {
        return errorMessage(caught, "Couldn't save the transaction.");
      }
    },
    null
  );

  const remove = () => {
    if (!transaction) return;
    onClose();
    void removeWithUndo(actor, transaction);
  };

  return (
    <form
      action={saveAction}
      className="space-y-4"
      aria-label={transaction ? "Edit transaction" : "Add transaction"}
    >
      {/* The amount comes first, so the dialog opens with it focused. */}
      <div className="grid gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transaction-amount">Amount ({PESO_SIGN})</Label>
          <Input
            id="transaction-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            required
            defaultValue={transaction && formatPHPInput(transaction.amountCents)}
          />
        </div>
        <RadioGroup
          name="type"
          value={type}
          onValueChange={(next) => {
            if (!isTransactionType(next)) return;
            setType(next);
            // New money lands in Unassigned unless the member names a category.
            if (next === "income" && !transaction) setCategoryId(UNASSIGNED);
          }}
          className="grid grid-cols-2 gap-2 self-end"
          aria-label="Expense or income"
        >
          <ChoiceItem id="transaction-type-expense" value="expense" label="Expense" />
          <ChoiceItem id="transaction-type-income" value="income" label="Income" />
        </RadioGroup>
        <div className="space-y-2">
          <Label htmlFor="transaction-date">Date</Label>
          <Input
            id="transaction-date"
            name="date"
            type="date"
            required
            defaultValue={transaction?.date ?? format(new Date(), "yyyy-MM-dd")}
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
          <Select name="categoryId" value={shownCategoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="transaction-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {choices.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction-description">Description (optional)</Label>
        <Input
          id="transaction-description"
          name="description"
          maxLength={DESCRIPTION_MAX_LENGTH}
          autoComplete="off"
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
        <legend className="text-sm font-medium">Status</legend>
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
      <DialogFooter className="gap-2 @[480px]:justify-between">
        {transaction ? (
          <Button type="button" variant="outline" onClick={remove}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton pendingText="Saving...">
          {transaction ? "Save" : "Add transaction"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

function ChoiceItem({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <RadioGroupItem id={id} value={value} />
      <Label htmlFor={id} className="flex-1">
        {label}
      </Label>
    </div>
  );
}
