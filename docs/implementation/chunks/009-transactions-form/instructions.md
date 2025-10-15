# Instructions: Transactions Form

Follow these steps in order. Estimated time: 120 minutes.

---

## Step 1: Install Required Components (5 min)

```bash
npx shadcn-ui@latest add calendar
npx shadcn-ui@latest add popover
npx shadcn-ui@latest add radio-group
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add table
npx shadcn-ui@latest add switch
```

---

## Step 2: Create Date Picker Component (10 min)

Create `src/components/ui/date-picker.tsx`:

```typescript
import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          disabled={(date) => date > new Date()} // Can't pick future dates
        />
      </PopoverContent>
    </Popover>
  );
}
```

---

## Step 3: Create Category Selector Component (15 min)

Create `src/components/ui/category-selector.tsx`:

```typescript
import { useCategoriesGrouped } from "@/lib/supabaseQueries";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategorySelectorProps {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function CategorySelector({
  value,
  onChange,
  disabled,
  placeholder = "Select category",
}: CategorySelectorProps) {
  const { data: categories, isLoading } = useCategoriesGrouped();

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading categories..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {categories?.map((parent) => (
          <SelectGroup key={parent.id}>
            <SelectLabel>{parent.name}</SelectLabel>
            {parent.children.map((child) => (
              <SelectItem key={child.id} value={child.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: child.color }}
                  />
                  <span>{child.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
```

---

## Step 4: Create Transaction Validation Schema (10 min)

Create `src/lib/validations/transaction.ts`:

```typescript
import * as z from "zod";

export const transactionSchema = z.object({
  date: z.date({
    required_error: "Date is required",
  }),
  description: z
    .string()
    .min(3, "Description must be at least 3 characters")
    .max(200, "Description too long"),
  amount_cents: z
    .number()
    .int("Amount must be an integer")
    .positive("Amount must be positive")
    .max(999999999, "Amount too large"),
  type: z.enum(["income", "expense"], {
    required_error: "Type is required",
  }),
  account_id: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  status: z.enum(["pending", "cleared"]).default("pending"),
  visibility: z.enum(["household", "personal"]).default("household"),
  notes: z.string().max(500, "Notes too long").nullable().optional(),
});

export type TransactionFormData = z.infer<typeof transactionSchema>;
```

---

## Step 5: Create Transaction Form Dialog (30 min)

Create `src/components/TransactionFormDialog.tsx`:

```typescript
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  // Load existing transaction data when editing
  useEffect(() => {
    if (editingId && transactions) {
      const transaction = transactions.find((t) => t.id === editingId);
      if (transaction) {
        form.reset({
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
  }, [editingId, transactions, form]);

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

      form.reset();
      onClose();
    } catch (error) {
      console.error("Failed to save transaction:", error);
      toast.error("Failed to save transaction");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "Edit Transaction" : "New Transaction"}
          </DialogTitle>
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
              render={({ field }) => (
                <DatePicker value={field.value} onChange={field.onChange} />
              )}
            />
            {form.formState.errors.date && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.date.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              {...form.register("description")}
              placeholder="e.g., Groceries at SM"
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
                <Select
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                >
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
                <CategorySelector
                  value={field.value}
                  onChange={field.onChange}
                />
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

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Additional details..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving..."
                : editingId
                ? "Update"
                : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Step 6: Create Transaction List Component (30 min)

Create `src/components/TransactionList.tsx`:

```typescript
import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, CheckCircle, Circle } from "lucide-react";
import { useTransactions, useToggleTransactionStatus, useDeleteTransaction } from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";
import type { TransactionFilters } from "@/types/transactions";

interface Props {
  filters?: TransactionFilters;
  onEdit: (id: string) => void;
}

export function TransactionList({ filters, onEdit }: Props) {
  const { data: transactions, isLoading } = useTransactions(filters);
  const toggleStatus = useToggleTransactionStatus();
  const deleteTransaction = useDeleteTransaction();

  const handleDelete = async (id: string, description: string) => {
    if (confirm(`Delete transaction "${description}"?`)) {
      try {
        await deleteTransaction.mutateAsync(id);
      } catch (error) {
        console.error("Failed to delete:", error);
      }
    }
  };

  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No transactions found</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell className="font-mono text-sm">
              {format(parseISO(transaction.date), "MMM dd")}
            </TableCell>
            <TableCell>
              <div className="font-medium">{transaction.description}</div>
              {transaction.notes && (
                <div className="text-xs text-muted-foreground truncate max-w-xs">
                  {transaction.notes}
                </div>
              )}
            </TableCell>
            <TableCell>
              {transaction.category ? (
                <Badge variant="outline">{transaction.category.name}</Badge>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </TableCell>
            <TableCell>
              {transaction.account ? (
                <span className="text-sm">{transaction.account.name}</span>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </TableCell>
            <TableCell
              className={`text-right font-mono ${
                transaction.type === "income"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {transaction.type === "income" ? "+" : "-"}
              {formatPHP(transaction.amount_cents)}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleStatus.mutate(transaction.id)}
                className="h-8 w-8 p-0"
              >
                {transaction.status === "cleared" ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(transaction.id)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(transaction.id, transaction.description)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## Step 7: Create Transactions Page (15 min)

Create `src/routes/transactions.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TransactionList } from "@/components/TransactionList";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import type { TransactionFilters } from "@/types/transactions";

export const Route = createFileRoute("/transactions")({
  component: Transactions,
});

function Transactions() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({
    exclude_transfers: true, // Default: hide transfers
  });

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Transactions</h1>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <TransactionList filters={filters} onEdit={handleEdit} />
      </main>

      {/* Form Dialog */}
      <TransactionFormDialog
        open={isFormOpen}
        onClose={handleClose}
        editingId={editingId}
      />
    </div>
  );
}
```

---

## Step 8: Add Transactions Link to Dashboard (5 min)

Update `src/routes/dashboard.tsx`:

```typescript
// Add link card
<Link to="/transactions" className="block">
  <div className="rounded-lg border p-6 hover:bg-accent transition">
    <h3 className="font-semibold">Transactions</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      View and manage your transactions
    </p>
  </div>
</Link>
```

---

## Done!

When you can create, edit, and view transactions with all fields working, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.
