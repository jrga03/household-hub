# D9 Implementation: Transaction Form Integration

**Time estimate**: 1 hour
**Prerequisites**: D5 (Payment Processing), D6 (Reversals) complete

---

## Step 1: Locate Transaction Form (5 min)

Find the existing transaction form component in the codebase.

```bash
# Find transaction form files
find src -name "*TransactionForm*" -o -name "*transaction-form*"

# Common locations:
# src/components/transactions/TransactionForm.tsx
# src/routes/transactions/TransactionForm.tsx
# src/features/transactions/TransactionForm.tsx
```

**If no transaction form exists yet**:
This chunk assumes you have a basic transaction form. If not, create a minimal one:

```tsx
// src/components/transactions/TransactionForm.tsx (MINIMAL EXAMPLE)
import { useForm } from "react-hook-form";
import { nanoid } from "nanoid";
import { db } from "@/lib/dexie";

interface TransactionFormData {
  amount_cents: number;
  date: string;
  type: "income" | "expense";
  category_id: string;
  account_id: string;
  household_id: string;
}

export function TransactionForm({ householdId, onSuccess }) {
  const form = useForm<TransactionFormData>({
    defaultValues: {
      household_id: householdId,
      type: "expense",
    },
  });

  const onSubmit = async (data: TransactionFormData) => {
    const transaction = {
      id: nanoid(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.transactions.add(transaction);
    onSuccess?.(transaction.id);
  };

  return <form onSubmit={form.handleSubmit(onSubmit)}>{/* fields */}</form>;
}
```

For this implementation guide, we'll assume a transaction form exists.

---

## Step 2: Add Debt Selector Field (15 min)

Add debt link field to transaction form.

**File**: `src/components/transactions/TransactionForm.tsx` (MODIFY)

```tsx
import { useQuery } from "@tanstack/react-query";
import { listDebts } from "@/lib/debts";
import { calculateDebtBalance } from "@/lib/debts";
import { formatPHP } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Inside TransactionForm component:

// 1. Fetch active debts
const { data: debts } = useQuery({
  queryKey: ["debts", householdId, "external", "active"],
  queryFn: async () => {
    const allDebts = await listDebts(householdId, "external", { status: "active" });

    // Calculate balances for each debt
    const debtsWithBalances = await Promise.all(
      allDebts.map(async (debt) => ({
        ...debt,
        balance: await calculateDebtBalance(debt.id, "external"),
      }))
    );

    return debtsWithBalances;
  },
  enabled: !!householdId,
});

// 2. Watch for transfer state
const isTransfer = !!form.watch("transfer_group_id");

// 3. Add debt_id field to form schema (if using Zod)
const transactionSchema = z.object({
  // ... existing fields
  debt_id: z.string().optional(),
  internal_debt_id: z.string().optional(),
});

// 4. Add debt selector field to form JSX
return (
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* ... existing fields (amount, date, category, etc.) */}

      {/* Debt Selector */}
      <FormField
        control={form.control}
        name="debt_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Link to Debt (Optional)</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isTransfer}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a debt (optional)" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {/* None option */}
                <SelectItem value="">None</SelectItem>

                {/* Active debts */}
                {debts?.map((debt) => (
                  <SelectItem key={debt.id} value={debt.id}>
                    {debt.name} - Balance: {formatPHP(debt.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              {isTransfer
                ? "Transfers cannot be linked to debts"
                : "Optionally link this transaction to a debt payment"}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* ... submit button */}
    </form>
  </Form>
);
```

**Verification**:

```tsx
// Open transaction form
// Expected: "Link to Debt (Optional)" dropdown visible
// Select dropdown, see list of active debts with balances
// Select "None" to clear
```

---

## Step 3: Add Real-Time Balance Preview (10 min)

Show balance calculation as user types amount.

**File**: `src/components/transactions/TransactionForm.tsx` (MODIFY - add below debt selector)

```tsx
// Inside TransactionForm component, after debt selector:

// Watch debt selection and amount
const selectedDebtId = form.watch("debt_id");
const transactionAmount = form.watch("amount_cents");

// Find selected debt
const selectedDebt = debts?.find((d) => d.id === selectedDebtId);

// Calculate balance after payment
const balanceAfterPayment =
  selectedDebt && transactionAmount ? selectedDebt.balance - transactionAmount : null;

const isOverpayment = balanceAfterPayment !== null && balanceAfterPayment < 0;

// Add balance preview UI (below debt selector)
{
  selectedDebt && (
    <div className="rounded-lg border p-4 space-y-2">
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
                {formatPHP(balanceAfterPayment)}
              </span>
            </div>

            {isOverpayment && (
              <p className="text-xs text-amber-600 dark:text-amber-400 pt-2">
                ⚠ This will overpay by {formatPHP(Math.abs(balanceAfterPayment))}
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
  );
}
```

**Verification**:

```tsx
// Select a debt with ₱1,000 balance
// Type amount: ₱500
// Expected preview:
// - Current balance: ₱1,000.00
// - Payment amount: -₱500.00
// - After payment: ₱500.00

// Change amount to ₱1,200
// Expected:
// - After payment: ₱-200.00 (red)
// - Warning: "⚠ This will overpay by ₱200.00"
```

---

## Step 4: Integrate Payment Creation on Submit (10 min)

Call `processDebtPayment` when transaction created with debt link.

**File**: `src/components/transactions/TransactionForm.tsx` (MODIFY - update onSubmit)

```tsx
import { processDebtPayment } from "@/lib/debts";
import { toast } from "sonner";

// Update onSubmit function:
const onSubmit = async (data: TransactionFormData) => {
  try {
    // 1. Create transaction
    const transaction = {
      id: nanoid(),
      household_id: data.household_id,
      account_id: data.account_id,
      category_id: data.category_id,
      amount_cents: data.amount_cents,
      type: data.type,
      date: data.date,
      description: data.description,
      transfer_group_id: data.transfer_group_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.transactions.add(transaction);

    // 2. Create debt payment if linked
    if (data.debt_id || data.internal_debt_id) {
      const debtType: "external" | "internal" = data.debt_id ? "external" : "internal";
      const debtId = data.debt_id || data.internal_debt_id!;

      await processDebtPayment({
        transaction_id: transaction.id,
        amount_cents: data.amount_cents,
        payment_date: data.date,
        debt_id: data.debt_id,
        internal_debt_id: data.internal_debt_id,
        household_id: data.household_id,
      });

      // Success message with debt name
      const debt = debts?.find((d) => d.id === debtId);
      toast.success(`Transaction saved and payment applied to ${debt?.name || "debt"}`);
    } else {
      // Success message without debt
      toast.success("Transaction saved successfully");
    }

    // 3. Callback
    onSuccess?.(transaction.id);

    // 4. Reset form
    form.reset();
  } catch (error) {
    console.error("Failed to save transaction:", error);
    toast.error("Failed to save transaction. Please try again.");
  }
};
```

**Verification**:

```tsx
// Create transaction with debt link
// Expected:
// - Transaction created in database
// - Debt payment created in debt_payments table
// - Success toast: "Transaction saved and payment applied to [debt name]"
// - Form resets
```

---

## Step 5: Integrate Edit Handler (10 min)

Call `handleTransactionEdit` when transaction updated.

**File**: `src/lib/transactions/mutations.ts` (MODIFY or CREATE)

```typescript
import { db } from "@/lib/dexie";
import { handleTransactionEdit } from "@/lib/debts";

/**
 * Update existing transaction
 *
 * If debt link changed, handles payment reversal/recreation
 */
export async function updateTransaction(
  id: string,
  updates: Partial<Transaction>
): Promise<Transaction> {
  // Get existing transaction
  const existing = await db.transactions.get(id);

  if (!existing) {
    throw new Error(`Transaction ${id} not found`);
  }

  // Update transaction
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  await db.transactions.update(id, updated);

  // Handle debt payment changes if relevant fields changed
  const debtFieldsChanged =
    "amount_cents" in updates ||
    "debt_id" in updates ||
    "internal_debt_id" in updates ||
    "date" in updates;

  if (debtFieldsChanged) {
    await handleTransactionEdit({
      transaction_id: id,
      new_amount_cents: updated.amount_cents,
      new_debt_id: updated.debt_id,
      new_internal_debt_id: updated.internal_debt_id,
      payment_date: updated.date,
    });
  }

  return updated;
}
```

**File**: `src/components/transactions/TransactionForm.tsx` (MODIFY - if editing existing transaction)

```tsx
// If editing existing transaction, use updateTransaction instead:

import { updateTransaction } from "@/lib/transactions/mutations";

const onSubmit = async (data: TransactionFormData) => {
  try {
    if (existingTransactionId) {
      // Edit mode
      await updateTransaction(existingTransactionId, data);

      toast.success("Transaction updated and debt payment adjusted");
    } else {
      // Create mode (existing code from Step 4)
      // ...
    }

    onSuccess?.();
  } catch (error) {
    console.error("Failed to save transaction:", error);
    toast.error("Failed to save transaction. Please try again.");
  }
};
```

**Verification**:

```tsx
// Edit transaction: Change amount ₱500 → ₱300
// Expected:
// - Transaction updated
// - Old ₱500 payment reversed
// - New ₱300 payment created
// - Debt balance reflects ₱300 payment
```

---

## Step 6: Integrate Delete Handler (10 min)

Call `handleTransactionDelete` before deleting transaction.

**File**: `src/lib/transactions/mutations.ts` (ADD)

```typescript
import { handleTransactionDelete } from "@/lib/debts";

/**
 * Delete transaction
 *
 * Reverses debt payment if transaction was linked to debt
 */
export async function deleteTransaction(id: string): Promise<void> {
  // Reverse debt payment FIRST (if linked)
  await handleTransactionDelete({ transaction_id: id });

  // Then delete transaction
  await db.transactions.delete(id);
}
```

**File**: Component that handles transaction deletion (e.g., TransactionList or TransactionDetail)

```tsx
import { deleteTransaction } from "@/lib/transactions/mutations";
import { toast } from "sonner";

// In delete handler:
const handleDelete = async (transactionId: string) => {
  try {
    // Optional: Show confirmation dialog
    const confirmed = await confirmDialog({
      title: "Delete Transaction",
      message: "This will also reverse any debt payments linked to this transaction.",
    });

    if (!confirmed) return;

    // Delete transaction (handles reversal internally)
    await deleteTransaction(transactionId);

    toast.success("Transaction deleted and debt balance restored");

    // Refresh list
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["debts"] });
  } catch (error) {
    console.error("Failed to delete transaction:", error);
    toast.error("Failed to delete transaction. Please try again.");
  }
};
```

**Verification**:

```tsx
// Delete transaction linked to debt (₱500 payment)
// Expected:
// - ₱500 reversal created
// - Debt balance increases by ₱500
// - Transaction deleted
// - Success toast
```

---

## Step 7: Add Validation for Edge Cases (10 min)

Prevent invalid combinations.

**File**: `src/components/transactions/TransactionForm.tsx` (ADD validation)

```tsx
// Inside TransactionForm component:

// 1. Disable debt selector for transfers
const isTransfer = !!form.watch("transfer_group_id");

// Effect: Clear debt link if transfer selected
useEffect(() => {
  if (isTransfer) {
    form.setValue("debt_id", undefined);
    form.setValue("internal_debt_id", undefined);
  }
}, [isTransfer, form]);

// 2. Validate amount > 0 if debt linked
const transactionSchema = z
  .object({
    // ... existing fields
    amount_cents: z.number().int().min(1, "Amount must be greater than zero"),
    debt_id: z.string().optional(),
  })
  .refine(
    (data) => {
      // If debt linked, amount must be positive
      if ((data.debt_id || data.internal_debt_id) && data.amount_cents <= 0) {
        return false;
      }
      return true;
    },
    {
      message: "Amount must be greater than ₱0.00 to link to debt",
      path: ["amount_cents"],
    }
  );

// 3. Filter out archived/deleted debts (already done in Step 2)

// 4. Show warning for paid-off debts
{
  selectedDebt?.status === "paid_off" && (
    <p className="text-sm text-amber-600 dark:text-amber-400">
      ⚠ This debt is already paid off. You can still make a payment if needed (e.g., overpayment
      refund).
    </p>
  );
}
```

**Verification**:

```tsx
// Try to link debt to transfer
// Expected: Debt selector disabled, shows "Transfers cannot be linked to debts"

// Link debt, set amount to ₱0
// Expected: Validation error "Amount must be greater than ₱0.00 to link to debt"

// Select paid-off debt
// Expected: Warning shown, but still allows selection
```

---

## Step 8: Query Invalidation (5 min)

Ensure UI updates after payment creation.

**File**: `src/components/transactions/TransactionForm.tsx` (MODIFY - add query invalidation)

```tsx
import { useQueryClient } from "@tanstack/react-query";

// Inside TransactionForm component:
const queryClient = useQueryClient();

// In onSubmit, after successful save:
const onSubmit = async (data: TransactionFormData) => {
  try {
    // ... existing save logic

    // Invalidate queries to refresh UI
    queryClient.invalidateQueries({ queryKey: ["transactions"] });

    if (data.debt_id || data.internal_debt_id) {
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      queryClient.invalidateQueries({ queryKey: ["debt-balance"] });
    }

    // ... success toast
  } catch (error) {
    // ... error handling
  }
};
```

**Verification**:

```tsx
// Create transaction with debt link
// Expected:
// - Transaction list updates immediately
// - Debt balance updates immediately
// - No manual refresh needed
```

---

## Final Verification

Test complete workflow end-to-end:

```tsx
// Test 1: Create transaction with debt link
// 1. Open transaction form
// 2. Fill amount: ₱500
// 3. Select debt: "Car Loan (Balance: ₱1,000)"
// 4. Preview shows: "After payment: ₱500.00"
// 5. Submit
// Expected:
// - Success toast with debt name
// - Transaction list shows transaction
// - Debt balance now ₱500

// Test 2: Edit transaction amount
// 1. Open same transaction for edit
// 2. Change amount: ₱500 → ₱300
// 3. Save
// Expected:
// - Old ₱500 payment reversed
// - New ₱300 payment created
// - Debt balance now ₱700

// Test 3: Remove debt link
// 1. Open same transaction for edit
// 2. Change debt selector to "None"
// 3. Save
// Expected:
// - ₱300 payment reversed
// - Debt balance back to ₱1,000

// Test 4: Delete transaction
// 1. Delete transaction (had ₱300 payment)
// Expected:
// - Payment reversed
// - Debt balance remains ₱1,000
// - Transaction removed from list

// Test 5: Transfer validation
// 1. Create transfer transaction
// Expected:
// - Debt selector disabled
// - Cannot link debt to transfer
```

---

## Troubleshooting

### Issue: Debt selector not showing debts

**Symptom**: Dropdown is empty or loading forever.

**Cause**: Query not fetching or household_id missing.

**Fix**:

```tsx
// Check query is enabled
const { data: debts, isLoading, error } = useQuery({
  queryKey: ['debts', householdId, 'external', 'active'],
  queryFn: ...,
  enabled: !!householdId, // IMPORTANT
});

// Debug
console.log('Debts:', debts);
console.log('Loading:', isLoading);
console.log('Error:', error);
```

---

### Issue: Payment not created on submit

**Symptom**: Transaction saved but no debt payment record.

**Cause**: `processDebtPayment` not called or erroring silently.

**Fix**:

```tsx
// Add error handling
try {
  await processDebtPayment({...});
} catch (error) {
  console.error('Payment creation failed:', error);
  throw error; // Re-throw to show error toast
}
```

---

### Issue: Edit creates duplicate payments instead of reversing

**Symptom**: Multiple payments for same transaction.

**Cause**: `handleTransactionEdit` not called, or old payment not reversed.

**Fix**: Ensure `updateTransaction` calls `handleTransactionEdit`:

```typescript
await handleTransactionEdit({
  transaction_id: id,
  new_amount_cents: updated.amount_cents,
  new_debt_id: updated.debt_id,
  payment_date: updated.date,
});
```

---

### Issue: Delete doesn't reverse payment

**Symptom**: Debt balance not restored after delete.

**Cause**: `handleTransactionDelete` not called before deletion.

**Fix**: Ensure delete flow calls handler:

```typescript
// CORRECT order
await handleTransactionDelete({ transaction_id: id });
await db.transactions.delete(id);

// WRONG order (reversal won't work)
await db.transactions.delete(id);
await handleTransactionDelete({ transaction_id: id }); // Too late!
```

---

## ★ Insight ─────────────────────────────────────

**Optional Field Design**: The debt link is **intentionally optional** because the vast majority of transactions are NOT debt payments. Requiring users to select "None" for every grocery purchase would be terrible UX. By making it optional:

- Default behavior: no debt link (most common case)
- Opt-in: users explicitly choose to link (rare case)
- Clear intent: presence of debt_id signals "this is a debt payment"

**Reversal Integration Timing**: The order of operations matters critically:

**On Edit**:

1. Update transaction first (establish new state)
2. Then handle reversals (adjust payments to match new state)

**On Delete**:

1. Reverse payments first (preserve audit trail)
2. Then delete transaction (remove from database)

This ensures consistency: payments always reflect transaction state, and audit trail preserved before deletion.

**Real-Time Preview Pattern**: Showing balance calculations as the user types provides **immediate feedback** that helps users make better decisions:

- See exact balance after payment (no surprises)
- Warned about overpayments before submitting
- Celebrate when payment will fully pay off debt
  This transforms debt payments from "hope I got it right" to "I know exactly what will happen."

─────────────────────────────────────────────────

---

**Time check**: You should have completed D9 in ~1 hour.

**Next**: Chunk D10 - Event Sourcing Integration
