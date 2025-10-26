import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  useAccounts,
  useCreateTransaction,
  useUpdateTransaction,
  useTransactions,
} from "@/lib/supabaseQueries";
import { transactionSchema, type TransactionFormData } from "@/lib/validations/transaction";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  editingId?: string | null;
  defaultType?: "income" | "expense";
}

export function TransactionFormDialog({
  open,
  onClose,
  editingId,
  defaultType = "expense",
}: Props) {
  const user = useAuthStore((state) => state.user);
  const { data: accounts } = useAccounts();
  const { data: transactions } = useTransactions();
  const createTransaction = useCreateTransaction();
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
    },
  });

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
    });
    onClose();
  };

  // Load existing transaction data when editing
  const { reset } = form;
  useEffect(() => {
    if (editingId && transactions) {
      const transaction = transactions.find((t) => t.id === editingId);
      if (transaction) {
        reset({
          date: parseISO(transaction.date),
          description: transaction.description,
          amount_cents: transaction.amount_cents,
          type: transaction.type,
          account_id: transaction.account_id,
          category_id: transaction.category_id,
          status: transaction.status,
          visibility: transaction.visibility,
          notes: transaction.notes,
        });
      }
    }
  }, [editingId, transactions, reset]);

  const onSubmit = async (data: TransactionFormData) => {
    try {
      const transactionData = {
        date: format(data.date, "yyyy-MM-dd"), // Convert to DATE string
        description: data.description,
        amount_cents: data.amount_cents,
        type: data.type,
        account_id: data.account_id || null,
        category_id: data.category_id || null,
        status: data.status,
        visibility: data.visibility,
        notes: data.notes || null,
        created_by_user_id: user?.id,
      };

      if (editingId) {
        await updateTransaction.mutateAsync({
          id: editingId,
          updates: transactionData,
        });
        toast.success("Transaction updated");
      } else {
        await createTransaction.mutateAsync(transactionData);
        toast.success("Transaction created");
      }

      handleClose();
    } catch (error) {
      console.error("Failed to save transaction:", error);
      toast.error("Failed to save transaction");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Transaction" : "New Transaction"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          {/* Account */}
          <div>
            <Label htmlFor="account">Account (optional)</Label>
            <Controller
              name="account_id"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
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

          {/* Category */}
          <div>
            <Label>Category (optional)</Label>
            <Controller
              name="category_id"
              control={form.control}
              render={({ field }) => (
                <CategorySelector value={field.value} onChange={field.onChange} />
              )}
            />
          </div>

          {/* Status */}
          <div>
            <Label htmlFor="status">Status</Label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
