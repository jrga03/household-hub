import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useForm, Controller, type SubmitErrorHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { CategorySelector } from "@/components/ui/category-selector";
import { useAccounts, useUpdateTransaction, useTransaction } from "@/lib/supabaseQueries";
import { transactionSchema, type TransactionFormData } from "@/lib/validations/transaction";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateDebtBalance } from "@/lib/debts";
import { listDebts } from "@/lib/debts/crud";
import { confirmDiscardChanges } from "@/lib/confirm-discard";
import { createOfflineTransaction, updateOfflineTransaction } from "@/lib/offline/transactions";
import { syncProcessor } from "@/lib/sync/processor";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Debt } from "@/types/debt";

interface Props {
  open: boolean;
  onClose: () => void;
  editingId?: string | null;
  defaultType?: "income" | "expense";
}

/**
 * Fields that live behind the "More options" disclosure. RHF keeps values for
 * unmounted fields (shouldUnregister defaults to false), so a validation error
 * on one of these while the section is collapsed would make submit a silent
 * no-op: handleSubmit rejects but shouldFocusError cannot focus an unmounted
 * input. onInvalid re-expands the section so the error is visible.
 */
const COLLAPSED_FIELDS = ["notes", "debt_id", "internal_debt_id", "status", "visibility"] as const;

export function TransactionFormDialog({
  open,
  onClose,
  editingId,
  defaultType = "expense",
}: Props) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  // Low-frequency sections (debt link, status, visibility, notes) live behind
  // this disclosure; auto-expanded when an edited transaction has non-default
  // values there so editing never hides filled-in data (review R5).
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const { data: accounts } = useAccounts();
  // Fetch only the row being edited, not the whole (100-row, joined) list.
  // The old useTransactions() subscription also couldn't reach rows past 100
  // or any transfer leg (review DATA-06).
  const { data: editingTransaction } = useTransaction(editingId ?? "");
  const updateTransaction = useUpdateTransaction();

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      date: new Date(),
      description: "",
      amount_cents: 0,
      type: defaultType,
      account_id: null,
      category_id: null,
      status: "pending",
      visibility: "household",
      notes: null,
      debt_id: undefined,
      internal_debt_id: undefined,
    },
  });

  // Guard in-app navigation while a half-completed form is on screen (review
  // R37): TanStack Router's useBlocker intercepts pushes/replaces AND the
  // history pop that the overlay sentinel (useHistoryBackClose inside the
  // Dialog/Sheet wrappers) turns hardware back into, so a dirty form always
  // gets a discard confirm. Disabled when clean or closed. The confirm goes
  // through the confirm-discard injectable so Phase 5.4 can swap
  // window.confirm for AlertDialog in one place.
  const { isDirty } = form.formState;
  useBlocker({
    shouldBlockFn: async () => {
      if (!open || !form.formState.isDirty) return false;
      return !(await confirmDiscardChanges());
    },
    disabled: !open || !isDirty,
    enableBeforeUnload: () => open && form.formState.isDirty,
  });

  // Watch form fields for debt selector logic
  const isTransfer = !!form.watch("transfer_group_id");
  const selectedDebtId = form.watch("debt_id");
  const transactionAmount = form.watch("amount_cents");

  // Fetch active debts for selector
  const { data: debts } = useQuery({
    queryKey: ["debts", user?.id, "external", "active"],
    queryFn: async () => {
      if (!user?.id) return [];

      const allDebts = await listDebts(user.id, "external", { status: "active" });

      // Calculate balances for each debt
      const debtsWithBalances = await Promise.all(
        allDebts.map(async (debt: Debt) => ({
          ...debt,
          balance: await calculateDebtBalance(debt.id, "external"),
        }))
      );

      return debtsWithBalances;
    },
    enabled: !!user?.id && open,
  });

  // Find selected debt and calculate balance preview
  const selectedDebt = debts?.find((d: Debt & { balance: number }) => d.id === selectedDebtId);
  const balanceAfterPayment =
    selectedDebt && transactionAmount ? selectedDebt.balance - transactionAmount : null;
  const isOverpayment = balanceAfterPayment !== null && balanceAfterPayment < 0;

  // Clear debt link when transfer selected
  useEffect(() => {
    if (isTransfer) {
      form.setValue("debt_id", undefined);
      form.setValue("internal_debt_id", undefined);
    }
  }, [isTransfer, form]);

  // Centralized close handler with form reset
  const handleClose = () => {
    form.reset({
      date: new Date(),
      description: "",
      amount_cents: 0,
      type: defaultType,
      account_id: null,
      category_id: null,
      status: "pending",
      visibility: "household",
      notes: null,
      debt_id: undefined,
      internal_debt_id: undefined,
    });
    setShowMoreOptions(false);
    onClose();
  };

  // Load existing transaction data when editing
  const { reset } = form;
  useEffect(() => {
    if (editingId && editingTransaction) {
      reset({
        date: parseISO(editingTransaction.date),
        description: editingTransaction.description,
        amount_cents: editingTransaction.amount_cents,
        type: editingTransaction.type,
        account_id: editingTransaction.account_id,
        category_id: editingTransaction.category_id,
        status: editingTransaction.status,
        visibility: editingTransaction.visibility,
        notes: editingTransaction.notes,
        debt_id: editingTransaction.debt_id ?? undefined,
        internal_debt_id: editingTransaction.internal_debt_id ?? undefined,
      });

      // Auto-expand "More options" when any collapsed section differs from
      // its default, so editing never hides filled-in data.
      if (
        editingTransaction.status !== "pending" ||
        editingTransaction.visibility !== "household" ||
        !!editingTransaction.notes ||
        !!editingTransaction.debt_id ||
        !!editingTransaction.internal_debt_id
      ) {
        setShowMoreOptions(true);
      }
    }
  }, [editingId, editingTransaction, reset]);

  // Second argument to handleSubmit: when validation fails on a field hidden
  // inside the collapsed "More options" section, expand it so the error
  // paragraph renders instead of the submit silently doing nothing.
  const onInvalid: SubmitErrorHandler<TransactionFormData> = (errors) => {
    if (COLLAPSED_FIELDS.some((field) => field in errors)) {
      setShowMoreOptions(true);
    }
  };

  const onSubmit = async (data: TransactionFormData) => {
    try {
      const dateStr = format(data.date, "yyyy-MM-dd");

      // Offline saves succeed locally (outbox) but won't reach the server
      // until connectivity returns; say so instead of the normal copy so the
      // user isn't surprised when the change is missing on another device.
      const isOnline = navigator.onLine;
      const offlineMessage = "Saved on this device, will sync when online";

      if (editingId) {
        // Update via offline-first path (includes debt handling)
        const result = await updateOfflineTransaction(
          editingId,
          {
            date: dateStr,
            description: data.description,
            amount_cents: data.amount_cents,
            type: data.type,
            account_id: data.account_id || undefined,
            category_id: data.category_id || undefined,
            // Explicit null = intentional unlink (debt Select's "None");
            // updateOfflineTransaction preserves the link only when the key
            // is undefined/omitted. The form holds the current link after
            // the edit reset, so an empty value means the user cleared it.
            debt_id: data.debt_id || null,
            internal_debt_id: data.internal_debt_id || null,
            status: data.status,
            visibility: data.visibility,
            notes: data.notes || undefined,
          },
          user?.id || ""
        );

        if (!result.success) {
          // Fallback to direct Supabase update for non-temp IDs
          await updateTransaction.mutateAsync({
            id: editingId,
            updates: {
              date: dateStr,
              description: data.description,
              amount_cents: data.amount_cents,
              type: data.type,
              account_id: data.account_id || null,
              category_id: data.category_id || null,
              debt_id: data.debt_id || null,
              internal_debt_id: data.internal_debt_id || null,
              status: data.status,
              notes: data.notes || null,
            },
          });
        }

        toast.success(isOnline ? "Transaction updated" : offlineMessage);
      } else {
        // Create via offline-first path (includes sync queue + debt handling)
        const result = await createOfflineTransaction(
          {
            date: dateStr,
            description: data.description,
            amount_cents: data.amount_cents,
            type: data.type,
            account_id: data.account_id || undefined,
            category_id: data.category_id || undefined,
            debt_id: data.debt_id || undefined,
            internal_debt_id: data.internal_debt_id || undefined,
            status: data.status,
            visibility: data.visibility,
            notes: data.notes || undefined,
          },
          user?.id || ""
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to create transaction");
        }

        if (!isOnline) {
          toast.success(offlineMessage);
        } else if (data.debt_id || data.internal_debt_id) {
          const debtName = selectedDebt?.name || "debt";
          toast.success(`Transaction saved and payment applied to ${debtName}`);
        } else {
          toast.success("Transaction created");
        }
      }

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (data.debt_id || data.internal_debt_id) {
        queryClient.invalidateQueries({ queryKey: ["debts"] });
        queryClient.invalidateQueries({ queryKey: ["debt-balance"] });
      }

      // Fire-and-forget outbox drain so the change reaches the server right
      // away when online instead of waiting for the next focus/interval
      // trigger (review R9). Never blocks or fails the submit. Skipped
      // offline: processQueue would attempt the network call and burn a
      // retry-budget slot per queued item, so gate on navigator.onLine.
      if (user?.id && navigator.onLine) {
        syncProcessor
          .processQueue(user.id)
          .then(() => queryClient.invalidateQueries({ queryKey: ["transactions"] }))
          .catch(() => {});
      }

      handleClose();
    } catch (error) {
      console.error("Failed to save transaction:", error);
      toast.error("Failed to save transaction. Please try again.");
    }
  };

  const title = editingId ? "Edit Transaction" : "New Transaction";

  // Shared between the mobile Sheet and desktop Dialog shells; both scroll
  // containers host the same fields and the sticky footer (review R5).
  const formBody = (
    <form
      onSubmit={form.handleSubmit(onSubmit, onInvalid)}
      className={cn("space-y-4", isMobile && "px-4")}
    >
      {/* Amount */}
      <div>
        <Label htmlFor="amount">Amount</Label>
        <Controller
          name="amount_cents"
          control={form.control}
          render={({ field, fieldState }) => (
            <CurrencyInput
              id="amount"
              {...field}
              error={fieldState.error?.message}
              autoFocus
              autoComplete="off"
            />
          )}
        />
      </div>

      {/* Type (Income/Expense) */}
      <div>
        <Label>Type</Label>
        <Controller
          name="type"
          control={form.control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="flex gap-4 mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="expense" id="expense" />
                <Label htmlFor="expense" className="font-normal cursor-pointer">
                  Expense
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="income" id="income" />
                <Label htmlFor="income" className="font-normal cursor-pointer">
                  Income
                </Label>
              </div>
            </RadioGroup>
          )}
        />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          {...form.register("description")}
          placeholder="e.g., Groceries at SM"
          autoComplete="off"
        />
        {form.formState.errors.description && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      {/* Category */}
      <div>
        <Label>Category (optional)</Label>
        <Controller
          name="category_id"
          control={form.control}
          render={({ field }) => <CategorySelector value={field.value} onChange={field.onChange} />}
        />
      </div>

      {/* Account */}
      <div>
        <Label htmlFor="account">Account (optional)</Label>
        <Controller
          name="account_id"
          control={form.control}
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Date */}
      <div>
        <Label>Date</Label>
        <Controller
          name="date"
          control={form.control}
          render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />}
        />
        {form.formState.errors.date && (
          <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>
        )}
      </div>

      {/* More options disclosure: debt link, status, visibility, notes */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-1 px-0"
        onClick={() => setShowMoreOptions(!showMoreOptions)}
        aria-expanded={showMoreOptions}
      >
        {showMoreOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        More options
      </Button>

      {showMoreOptions && (
        <>
          {/* Debt Selector */}
          <div>
            <Label htmlFor="debt">Link to Debt (Optional)</Label>
            <Controller
              name="debt_id"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                  disabled={isTransfer}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a debt (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Radix Select throws on empty-string item values; "none" is the sentinel */}
                    <SelectItem value="none">None</SelectItem>
                    {debts?.map((debt: Debt & { balance: number }) => (
                      <SelectItem key={debt.id} value={debt.id}>
                        {debt.name} - Balance: {formatPHP(debt.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isTransfer
                ? "Transfers cannot be linked to debts"
                : "Optionally link this transaction to a debt payment"}
            </p>
            {form.formState.errors.debt_id && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.debt_id.message}
              </p>
            )}
          </div>

          {/* Balance Preview */}
          {selectedDebt && (
            <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
              <h4 className="font-medium text-sm">Payment Preview</h4>

              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current balance:</span>
                  <span className="font-medium">{formatPHP(selectedDebt.balance)}</span>
                </div>

                {transactionAmount > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment amount:</span>
                      <span className="font-medium">-{formatPHP(transactionAmount)}</span>
                    </div>

                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">After payment:</span>
                      <span
                        className={cn(
                          "font-bold",
                          isOverpayment && "text-red-600 dark:text-red-400",
                          balanceAfterPayment === 0 && "text-green-600 dark:text-green-400"
                        )}
                      >
                        {formatPHP(balanceAfterPayment!)}
                      </span>
                    </div>

                    {isOverpayment && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 pt-2">
                        ⚠ This will overpay by {formatPHP(Math.abs(balanceAfterPayment!))}
                      </p>
                    )}

                    {balanceAfterPayment === 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400 pt-2">
                        ✓ This will pay off the debt completely
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <Label htmlFor="status">Status</Label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cleared">Cleared</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Visibility */}
          <div>
            <Label htmlFor="visibility">Visibility</Label>
            <Controller
              name="visibility"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="household">Household</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Household transactions visible to all users. Personal only to you.
            </p>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Additional details..."
              rows={3}
              autoComplete="off"
            />
            {form.formState.errors.notes && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.notes.message}</p>
            )}
          </div>
        </>
      )}

      {/* Actions: sticky footer inside the scroll container (review R5) */}
      <div
        className={cn(
          "sticky bottom-0 flex justify-end gap-2 border-t bg-background pt-4",
          isMobile ? "-mx-4 px-4 pb-[calc(1rem+var(--safe-area-bottom))]" : "-mx-6 -mb-6 px-6 pb-6"
        )}
      >
        <Button type="button" variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : editingId ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {formBody}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
