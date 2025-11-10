# Chunk D9: Transaction Form Integration

## At a Glance

- **Time**: 1 hour
- **Prerequisites**: D5 (Payment Processing), D6 (Reversals), D8 (Forms) complete
- **Can Skip**: No - core integration point
- **Depends On**: Existing transaction form, debt CRUD, reversal handlers

## What You're Building

Integration of debt payment functionality into the existing transaction form:

- **Debt selector**: Dropdown to link transaction to debt
- **Payment creation**: Auto-create debt payment when transaction saved
- **Edit handling**: Reverse old payment, create new payment (from D6)
- **Delete handling**: Reverse payment when transaction deleted (from D6)
- **Validation**: Prevent invalid debt links (archived debts, transfers)
- **UI feedback**: Show current debt balance, overpayment warnings
- **Optional linking**: Debt link is always optional (not required)

## Why This Matters

Transaction form integration is **how users actually make debt payments**:

- **User workflow**: Users create transactions → optionally link to debt → payment created automatically
- **Data integrity**: Reversals ensure edit/delete operations maintain accurate balances
- **Transparency**: Users see debt balance in real-time as they type amounts
- **Error prevention**: Validation prevents invalid combinations (e.g., transfers can't be debt payments)
- **Audit trail**: Complete payment history via transaction → payment linkage

This chunk completes the core debt payment workflow.

## Before You Start

Verify these prerequisites:

- [ ] **Transaction form exists** - Legacy transaction CRUD
- [ ] **Payment processing** (D5) complete
- [ ] **Reversal handlers** (D6) complete
- [ ] **Debt CRUD** (D4) available for fetching debt list
- [ ] **Balance calculation** (D3) for real-time balance display

**How to verify**:

```bash
# Find existing transaction form
find src -name "*transaction*form*" -o -name "*TransactionForm*"

# Check debt functions available
grep -r "processDebtPayment\|handleTransactionEdit\|handleTransactionDelete" src/lib/debts/
```

## What Happens Next

After this chunk:

- Users can link transactions to debts from transaction form
- Debt payments created automatically on transaction save
- Edit/delete operations properly reverse payments
- Ready for Chunk D10 (Event Sourcing Integration)

## Key Files Modified

```
src/
├── components/
│   └── transactions/
│       └── TransactionForm.tsx         # MODIFIED: Add debt selector
└── lib/
    └── transactions/
        └── mutations.ts                # MODIFIED: Integrate reversals
```

## Features Included

### Debt Selector in Transaction Form

**New field**:

- **Label**: "Link to Debt (Optional)"
- **Type**: Select dropdown
- **Options**: Active debts for household
- **Behavior**:
  - Shows only active debts (not archived/paid_off)
  - Displays debt name + current balance
  - Allows "None" option (clear selection)
  - Disabled for transfer transactions

### Real-Time Balance Display

**When debt selected**:

- Show current debt balance: "Current balance: ₱500.00"
- Show balance after payment: "After payment: ₱200.00"
- Warn if overpayment: "⚠ This will overpay by ₱100.00"

### Transaction Create Flow

**On transaction save with debt link**:

1. Create transaction in database
2. Call `processDebtPayment()` with transaction details
3. Show success toast: "Transaction saved and payment applied to [debt name]"
4. Redirect/refresh to show updated balance

### Transaction Edit Flow

**On transaction edit with debt link changed**:

1. Update transaction in database
2. Call `handleTransactionEdit()` which:
   - Reverses old payment (if exists)
   - Creates new payment (if debt still linked)
3. Show success toast: "Transaction updated and debt payment adjusted"

### Transaction Delete Flow

**On transaction delete with debt link**:

1. Call `handleTransactionDelete()` BEFORE deleting transaction
2. This creates reversal to restore debt balance
3. Delete transaction
4. Show success toast: "Transaction deleted and debt balance restored"

## Related Documentation

- **Payment Processing**: D5 chunk (processDebtPayment)
- **Reversal Handlers**: D6 chunk (handleTransactionEdit, handleTransactionDelete)
- **Transaction System**: Existing transaction CRUD
- **Decisions**:
  - #21: Debt linking via transaction form - DEBT-DECISIONS.md lines 755-796

## Technical Stack

- **React Hook Form**: Transaction form state (existing)
- **TanStack Query**: Debt list fetching
- **Dexie.js**: Transaction + payment mutations
- **TypeScript**: Type-safe integration

## Design Patterns

### Optional Field Pattern

```tsx
// Debt link is optional, not required
const transactionSchema = z.object({
  // ... existing fields
  debt_id: z.string().optional(),
  internal_debt_id: z.string().optional(),
});

// Only process payment if debt linked
if (data.debt_id || data.internal_debt_id) {
  await processDebtPayment({
    transaction_id: transaction.id,
    amount_cents: data.amount_cents,
    payment_date: data.date,
    debt_id: data.debt_id,
    internal_debt_id: data.internal_debt_id,
    household_id: data.household_id,
  });
}
```

**Why**: Debt linking is opt-in, not mandatory. Most transactions aren't debt payments.

### Conditional Field Pattern

```tsx
// Disable debt selector for transfers
const isTransfer = form.watch("transfer_group_id");

<FormField
  name="debt_id"
  render={({ field }) => (
    <Select {...field} disabled={isTransfer}>
      {/* options */}
    </Select>
  )}
/>;

{
  isTransfer && (
    <p className="text-sm text-muted-foreground">Transfers cannot be linked to debts</p>
  );
}
```

**Why**: Transfers represent movement between accounts, not debt payments. Linking would double-count in analytics.

### Reversal Integration Pattern

```tsx
async function updateTransaction(id: string, updates: TransactionUpdate) {
  // 1. Update transaction
  await db.transactions.update(id, updates);

  // 2. Handle debt payment changes (if any)
  if ("amount_cents" in updates || "debt_id" in updates) {
    await handleTransactionEdit({
      transaction_id: id,
      new_amount_cents: updates.amount_cents,
      new_debt_id: updates.debt_id,
      payment_date: updates.date,
    });
  }

  return updatedTransaction;
}
```

**Why**: Separation of concerns. Transaction updates and debt payment reversals are separate operations.

### Real-Time Balance Preview Pattern

```tsx
const debtId = form.watch("debt_id");
const amount = form.watch("amount_cents");

const { data: currentBalance } = useQuery({
  queryKey: ["debt-balance", debtId],
  queryFn: () => calculateDebtBalance(debtId, "external"),
  enabled: !!debtId,
});

const balanceAfterPayment = currentBalance ? currentBalance - amount : null;
const isOverpayment = balanceAfterPayment !== null && balanceAfterPayment < 0;

return (
  <div>
    <p>Current balance: {formatPHP(currentBalance)}</p>
    <p>After payment: {formatPHP(balanceAfterPayment)}</p>
    {isOverpayment && (
      <p className="text-amber-600">
        ⚠ This will overpay by {formatPHP(Math.abs(balanceAfterPayment))}
      </p>
    )}
  </div>
);
```

**Why**: Immediate feedback helps users make informed decisions about payment amounts.

## Critical Concepts

**Optional Linking**: Debt linking is **always optional**. The vast majority of transactions are NOT debt payments (groceries, salary, bills, etc.). Only transactions specifically intended as debt payments should be linked.

**Transfer Exclusion**: Transfers (transactions with `transfer_group_id`) **cannot be linked to debts**. Rationale:

- Transfers represent money movement between accounts
- Not income/expense, so not debt payments
- Would double-count in debt analytics
- UI prevents selection, backend validates

**Edit Operation Timing**: When editing a transaction with a debt link, the order is:

1. Update transaction (change amount/date/etc.)
2. Handle debt payment reversal/recreation
   This ensures the payment always reflects the current transaction state.

**Delete Operation Timing**: When deleting a transaction with a debt link, the order is:

1. Reverse debt payment (restore balance)
2. Delete transaction
   This ensures audit trail preserved before transaction removed.

**Overpayment Warnings Are Soft**: If user creates payment that overpays, show warning but allow submission. Users might intentionally overpay (e.g., round up to nice number). Defense-in-depth layer 2 (from D5) will flag it in the database.

## Integration Points

### Transaction Create

**Before**: Transaction saved to database only.

**After**:

```typescript
async function createTransaction(data: TransactionFormData) {
  // Create transaction
  const transaction = await db.transactions.add({
    id: nanoid(),
    ...data,
  });

  // Create debt payment if linked
  if (data.debt_id || data.internal_debt_id) {
    await processDebtPayment({
      transaction_id: transaction.id,
      amount_cents: data.amount_cents,
      payment_date: data.date,
      debt_id: data.debt_id,
      internal_debt_id: data.internal_debt_id,
      household_id: data.household_id,
    });
  }

  return transaction;
}
```

### Transaction Update

**Before**: Transaction updated in database only.

**After**:

```typescript
async function updateTransaction(id: string, updates: TransactionUpdate) {
  // Update transaction
  await db.transactions.update(id, updates);

  // Handle debt payment changes
  if ("amount_cents" in updates || "debt_id" in updates || "internal_debt_id" in updates) {
    await handleTransactionEdit({
      transaction_id: id,
      new_amount_cents: updates.amount_cents,
      new_debt_id: updates.debt_id,
      new_internal_debt_id: updates.internal_debt_id,
      payment_date: updates.date || transaction.date,
    });
  }

  return updatedTransaction;
}
```

### Transaction Delete

**Before**: Transaction deleted from database only.

**After**:

```typescript
async function deleteTransaction(id: string) {
  // Reverse debt payment FIRST
  await handleTransactionDelete({ transaction_id: id });

  // Then delete transaction
  await db.transactions.delete(id);
}
```

## Validation Rules

**Cannot link debt to transfer**:

- Check: `transfer_group_id IS NOT NULL`
- Action: Disable debt selector, show explanation

**Cannot link debt to zero-amount transaction**:

- Check: `amount_cents === 0`
- Action: Show warning "Amount must be greater than ₱0.00 to link to debt"

**Cannot link archived debt**:

- Filter: Only show active debts in selector
- If somehow selected: Reject with error "Cannot link to archived debt"

**Cannot link paid-off debt** (soft warning):

- Show in selector with "(Paid Off)" suffix
- Allow selection (user might make overpayment)
- Show warning: "This debt is already paid off"

## User Experience Flow

### Happy Path: Create Transaction with Debt Link

1. User clicks "New Transaction"
2. Form opens with all fields
3. User fills: Amount ₱500, Date, Category
4. User clicks "Link to Debt" dropdown
5. Dropdown shows active debts with balances
6. User selects "Car Loan (Balance: ₱1,000)"
7. UI shows: "After payment: ₱500.00"
8. User clicks "Save"
9. Success toast: "Transaction saved and payment applied to Car Loan"
10. Transaction list and debt detail both update

### Edit Flow: Change Amount

1. User edits transaction (₱500 → ₱300)
2. Clicks "Save"
3. Backend:
   - Updates transaction
   - Reverses old ₱500 payment
   - Creates new ₱300 payment
4. Success toast: "Transaction updated and debt payment adjusted"
5. Debt balance reflects new amount

### Delete Flow: Remove Transaction

1. User deletes transaction (₱500)
2. Confirmation dialog: "This will also reverse the ₱500 payment to Car Loan"
3. User confirms
4. Backend:
   - Reverses ₱500 payment (restores debt balance)
   - Deletes transaction
5. Success toast: "Transaction deleted and debt balance restored"

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
