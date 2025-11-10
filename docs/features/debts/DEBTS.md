# Debt Tracking Feature

## Terminology Reference

**Consistent terms used throughout debt documentation:**

| Term                                  | Definition                                        | Usage                                                                        |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Compensating Event** / **Reversal** | Negative payment that undoes a previous payment   | Use "reversal" for user-facing text, "compensating event" for technical docs |
| **Soft Delete**                       | Setting `deleted_at` timestamp (record remains)   | Always use "soft delete", never "mark as deleted" or "hard delete"           |
| **Balance ≤ 0**                       | Balance at or below zero (includes overpayments)  | Always use "≤ 0" or "at or below zero" for precision                         |
| **Defense-in-Depth**                  | Multi-layer validation (UI + application logic)   | Used for overpayment detection strategy                                      |
| **Accept-and-Track**                  | Allow operation but flag for review               | Used for overpayment handling approach                                       |
| **Derived Balance**                   | Calculated from payment history, not stored       | Never say "cached balance" or "stored balance"                               |
| **Idempotency Key**                   | Unique identifier preventing duplicate processing | Format: `${deviceId}-${entityType}-${entityId}-${lamportClock}`              |
| **Event Sourcing**                    | Immutable append-only event log                   | All changes recorded as events, never updates                                |
| **Lamport Clock**                     | Monotonic counter for event ordering              | Per-device counter stored in IndexedDB meta table                            |
| **Vector Clock**                      | Per-entity conflict resolution timestamps         | Used in Phase B for advanced conflict resolution                             |
| **Transfer Group ID**                 | Links paired transfer transactions                | ALL transfers have this (including debt-linked)                              |
| **Debt Payment**                      | Record in `debt_payments` table                   | Created automatically when transaction linked to debt                        |
| **Overpayment**                       | Payment exceeding remaining balance               | Flagged with `is_overpayment` and `overpayment_amount` fields                |
| **Archived**                          | Terminal status hiding debt from active lists     | Cannot be reactivated in MVP (Phase 2 feature)                               |
| **Paid Off**                          | Auto-set when balance ≤ 0                         | Can revert to active if reversal creates positive balance                    |
| **Internal Debt**                     | Borrowing within household                        | Between categories, accounts, or members                                     |
| **External Debt**                     | Money owed to outside entities                    | Car loans, mortgages, credit cards, personal loans                           |
| **Soft Reference**                    | Entity ID without FK constraint                   | Allows entity deletion without breaking debt history                         |
| **Display Name Cache**                | Stored entity name at debt creation               | Preserves historical context if entity renamed/deleted                       |

**Avoid These Terms**:

- ❌ "Hard delete" (use "soft delete" only)
- ❌ "Stored balance" (use "derived balance")
- ❌ "Reversal event" in user docs (use "payment reversal")
- ❌ "Conflict resolution" in user docs (use "multi-device sync")
- ❌ "FK constraint" in user docs (technical term only)

## Overview

The Debt Tracking feature allows households to monitor two types of debt:

- **External Debts**: Loans from outside sources (car loans, house loans, personal loans, credit cards)
- **Internal Debts**: Borrowing between household accounts or members

This is a **passive tracking system** - debts are for visibility only and don't affect transaction calculations, budgets, or account balances.

## Key Design Principles

- **Single Currency**: All debts and payments use the same currency (PHP)
- **Derived Balances**: Current balance calculated from payment history (never stored)
- **Immutable History**: All payments preserved for complete audit trail
- **Offline-First**: Full functionality without internet connection
- **Event Sourcing**: Uses unified `events` table for all entity types
- **Compensating Events**: Edits/deletions create reversals, not updates
- **Accept-and-Track Overpayments**: Allow overpayments but flag them for visibility

## Key Concepts

### External Debts

Track money owed to external entities:

- Car loan from bank
- House mortgage
- Personal loans
- Credit card debt

**Note**: External debts are for **reference tracking only**. They help you monitor "I owe $X, I've paid $Y, still owe $Z" without requiring every related transaction to be linked. You can optionally link expense transactions to track payments automatically, but this is not mandatory.

### Internal Debts (Household-Only)

Track borrowing within the household between:

- **Budget Categories**: One budget category lending to another (e.g., Savings category lends to Emergency)
  - References the `budget_categories` table
- **Accounts**: One account borrowing from another (e.g., Checking borrows from Savings)
  - References the `accounts` table
- **Members**: Individual member borrowing from household or another member
  - References the `profiles` table (household members)

**Note**: Internal debts are household-visible only in MVP. All household members can view and manage internal debts. Personal visibility for internal debts may be added in a future phase.

Each internal debt clearly tracks:

- **From**: The source (who/what is lending)
- **To**: The destination (who/what is borrowing)

**Display Names**: Entity names (category, account, or member names) are cached at debt creation time for performance. If an entity is renamed later, the debt will still show the original name. This is acceptable for MVP and avoids complex JOINs on every query.

**UI Handling for Stale Names**: When displaying internal debts, if the current entity name differs from the cached display name, show a tooltip: "Originally '{cached_name}', now '{current_name}'". This provides clarity without requiring database schema changes.

### Automatic Payment Recording

When creating a transaction (expense or transfer), you can optionally link it to a debt. This automatically:

1. Creates an immutable payment record
2. Updates the debt's calculated balance
3. Maintains full payment history

**Balance Calculation Formula**:

```
current_balance_cents = original_amount_cents - SUM(payment.amount_cents WHERE is_reversal = false AND NOT reversed)
```

Where:

- `original_amount_cents` is the initial debt amount (always positive)
- `payment.amount_cents` is positive for normal payments, negative for reversal payments
- Payments are excluded if they are reversal records (`is_reversal = true`) or if they were reversed by another payment
- Negative balance means overpayment (e.g., -500 = overpaid by ₱5.00)

### Overpayment Handling

The system uses an **accept-and-track** approach with **defense-in-depth validation**:

**Layer 1 - UI Warning (Best Effort)**:

- Frontend shows warning when payment exceeds current balance
- Warning is dismissible - user can still submit
- Helps prevent accidental overpayments in normal use

**Layer 2 - Application Logic (Primary Validation)**:

- Synchronous balance check BEFORE payment insert
- Calculates is_overpayment and overpayment_amount flags
- Flags are set during payment creation, not post-processing
- Ensures every payment has correct overpayment metadata

**Layer 3 - Database Trigger (Defense-in-Depth)**:

- Database trigger validates and sets overpayment flags on insert
- Prevents malicious clients from bypassing application-layer validation
- Recalculates flags server-side using current debt balance
- Ensures data integrity even if client validation is compromised

**Tracking & Display**:

- Sets `is_overpayment` flag and records `overpayment_amount` on payment record
- UI shows overpayment amount and warning icon in payment history
- Balance calculation allows negative balances (negative = overpaid amount)

**Overpayment Detection Logic** (Layers 2 & 3): A payment is flagged as overpayment if:

- The current balance is already zero or negative (already overpaid), OR
- The payment amount exceeds the current positive balance

This handles scenarios where:

- Two offline devices simultaneously pay the remaining balance
- User wants to pay ahead or round up payment
- Balance changes between viewing and submitting (no version conflicts)
- Multiple payments are made into an already overpaid debt

## User Workflows

### Creating a Debt

1. Navigate to Debts section
2. Click "Add Debt" button
3. Choose type: External or Internal
4. Enter details:
   - **Name**: Descriptive name (e.g., "Car Loan", "John borrowed from Savings")
     - **Uniqueness**: Names must be unique among active debts per household
     - You CAN have multiple debts with the same name if some are archived/paid off
   - **Original amount**: Total amount owed
   - **For internal debts**: Select source and destination entities

### Recording a Payment

1. Create a transaction:
   - **For External Debts**: Create an expense transaction (e.g., payment to bank, credit card company)
   - **For Internal Debts**: Create either an expense OR transfer transaction between household accounts
2. In the transaction form, select the debt from "Link to Debt" dropdown
3. Submit transaction
4. Payment is automatically recorded and balance recalculated

**Note**: Only active debts appear in the dropdown. Paid off or archived debts are hidden (see Edge Case #12 for queued offline payments).

### Editing or Deleting Transactions with Payments

When you edit or delete a transaction linked to a debt:

- **Edit amount/date**: System creates a reversal of the old payment and records the new payment
- **Delete transaction**: System creates a reversal payment to restore the debt balance, then soft deletes the transaction
- **All payment history is preserved** for complete audit trail (both payment records and soft-deleted transactions remain)

**Note**: Transactions use soft delete (sets `deleted_at` timestamp). The reversal payment mechanism ensures debt balance integrity is maintained, and soft deleted transactions can be restored if needed.

### Viewing Debt Status

The debt dashboard shows:

- **Current balance** for each debt (calculated from payment history)
- **Payment history** with all transactions and adjustments
- **Progress indicator** (% paid off)
- **Status**: Active, Paid Off, or Archived
- **Total debt summary** across all active debts

### Managing Debt Lifecycle

- **Active**: Debt is currently being tracked and can receive payments
- **Paid Off**: Automatically set when balance reaches zero
- **Archived**: Manually archive debts that are forgiven, sold, or no longer relevant
- **Delete**: Remove debts that were created by mistake (only if no payments exist)

## Database Schema

### Core Tables

```sql
-- External debts
debts (
  id, household_id, name,
  original_amount_cents,  -- Initial debt amount
  -- Note: current_balance_cents REMOVED (calculated from payments)
  status,                  -- active | paid_off | archived
  closed_at,               -- TIMESTAMPTZ - set when status changes to paid_off or archived
  created_at, updated_at
)

-- Internal debts
internal_debts (
  id, household_id, name,
  from_type, from_id,         -- Type: category | account | member
  from_display_name,          -- Cached name at creation time
  to_type, to_id,             -- Type: category | account | member
  to_display_name,            -- Cached name at creation time
  original_amount_cents,
  -- Note: current_balance_cents REMOVED (calculated from payments)
  status,                      -- active | paid_off | archived
  closed_at,                   -- TIMESTAMPTZ - set when status changes to paid_off or archived
  created_at, updated_at
)

-- Payment history (immutable audit trail)
debt_payments (
  id, household_id,
  debt_id, internal_debt_id, transaction_id,
  amount_cents,            -- Positive for payments, negative for reversals
  payment_date,            -- DATE type (user's local date, canonical)
  is_reversal,             -- true if this IS a reversal payment (set once at creation)
  reverses_payment_id,     -- ID of payment being reversed (if this is a reversal)
  is_overpayment,          -- true if payment exceeded remaining balance
  overpayment_amount,      -- Amount that exceeded balance (if applicable)
  adjustment_reason,       -- Explanation for reversals/adjustments
  created_at               -- TIMESTAMPTZ (UTC) - used for event ordering
)

-- Transaction linkage
transactions.debt_id (optional FK to debts)
transactions.internal_debt_id (optional FK to internal_debts)
```

## Important Notes

### What Debts DON'T Do

- Don't affect budget calculations
- Don't change account balances
- Don't appear in income/expense reports (debt-linked transfers still excluded via `WHERE transfer_group_id IS NULL`)
- Don't have interest calculations
- Don't have payment schedules
- Don't send payment reminders

### What Debts DO

- Track running balance
- Record payment history
- Link to actual transactions (expenses or transfers)
- Sync across devices
- Work offline
- Provide visibility into obligations

### Transfer Handling for Internal Debts Only

**IMPORTANT**: Transfer linkage is supported **only for internal debts**, not external debts. External debt payments must be recorded as expense transactions.

Internal debt payments can be recorded as transfers between accounts. These transfers follow a specific pattern to maintain both transfer integrity and debt tracking:

- **Both transactions have `transfer_group_id`**: This UUID links the expense and income transactions together as a matched pair (standard transfer behavior)
- **Only expense transaction has `internal_debt_id`**: The expense (from-account) side is linked to the debt for payment tracking
- **Income transaction has `internal_debt_id: null`**: The paired income (to-account) side is NOT linked to prevent double-counting
- **Excluded from spending reports**: The existing pattern `WHERE transfer_group_id IS NULL` automatically excludes ALL transfers from analytics

**Example**: Paying an internal debt (Checking owes Savings ₱500) via transfer:

1. **Expense from checking**: `transfer_group_id: 'abc', internal_debt_id: 'debt-123'` ← Linked to debt
2. **Income to savings**: `transfer_group_id: 'abc', internal_debt_id: null` ← NOT linked to debt

**Key Design Points**:

- `transfer_group_id` is present on BOTH transactions (maintains transfer pairing integrity)
- `internal_debt_id` is present ONLY on the expense transaction (tracks debt payment exactly once)
- External debts (`debt_id`) can ONLY be linked to expense transactions, never transfers
- This dual-field approach ensures debt payments are counted correctly while preserving standard transfer behavior

## API Endpoints

### Debt Management

```typescript
// Get all debts
GET /api/debts?status=active  // Optional status filter
GET /api/internal-debts?status=active

// Create debt
POST /api/debts
POST /api/internal-debts

// Update debt (name, status, archive)
PATCH /api/debts/:id
PATCH /api/internal-debts/:id

// Delete debt (soft delete, only if no payments)
DELETE /api/debts/:id
DELETE /api/internal-debts/:id

// Get payment history
GET /api/debt-payments?debt_id=:id
GET /api/debt-payments?internal_debt_id=:id
```

### Automatic Payment Processing

When a transaction (expense or transfer) is created with a debt link:

```typescript
// Transaction creation with debt payment
if (transaction.debt_id || transaction.internal_debt_id) {
  // Calculate current balance (may be negative if overpaid)
  const currentBalance = calculateDebtBalance(debtId);

  // Overpayment detection: flag if balance is already ≤ 0 OR payment exceeds positive balance
  const isOverpayment = currentBalance <= 0 || transaction.amount_cents > currentBalance;
  const overpaymentAmount = isOverpayment
    ? currentBalance > 0
      ? transaction.amount_cents - currentBalance
      : transaction.amount_cents
    : null;

  // Always create immutable payment record (accept-and-track approach)
  createDebtPayment({
    debt_id: transaction.debt_id,
    internal_debt_id: transaction.internal_debt_id,
    transaction_id: transaction.id,
    amount_cents: transaction.amount_cents,
    payment_date: transaction.date,
    is_overpayment: isOverpayment,
    overpayment_amount: overpaymentAmount,
  });

  // Balance is derived from sum of payments (can be negative)
  // If balance reaches zero or below, auto-update status to paid_off
  const newBalance = calculateDebtBalance(debtId);
  if (newBalance <= 0 && debt.status !== "paid_off") {
    updateDebtStatus(debtId, "paid_off");
  }
}
```

### Transaction Edit/Delete Handling

```typescript
// When transaction with debt payment is edited
onTransactionEdit(oldTransaction, newTransaction) {
  if (oldTransaction.debt_id || oldTransaction.internal_debt_id) {
    // Create reversal for old payment
    createDebtPayment({
      ...oldPayment,
      amount_cents: -oldTransaction.amount_cents,
      reverses_payment_id: oldPayment.id,
      adjustment_reason: "Transaction edited"
    });

    // Create new payment
    createDebtPayment({
      ...newPaymentData,
      amount_cents: newTransaction.amount_cents
    });
  }
}
```

## Privacy & Permissions

Debts follow the same household visibility rules:

- All household members can view/edit debts
- Debt data is isolated between households
- Full audit trail via event sourcing
- RLS policies enforce access control

## Offline Support

Debt tracking works offline:

- Debts cached in IndexedDB
- Payments queue when offline
- Balances calculate locally
- Sync when reconnected

## Edge Cases and Handling

### Multi-Device Offline Scenarios

1. **Concurrent Overpayments**: Two devices pay simultaneously while offline
   - **Frontend**: Both devices show balance before their own payment (no overpayment warning)
   - **Backend**: During sync, server detects both payments as overpayments and flags them
   - Both payments accepted and marked with `is_overpayment` flag
   - UI shows total overpayment amount with options to reverse
   - Example: Debt has ₱100 balance. Device A pays ₱100 offline, Device B pays ₱100 offline. Server accepts both, final balance is -₱100 (overpaid by ₱100)

2. **Payment vs Deletion Race**: Device A creates payment offline, Device B deletes debt online
   - Debt deletion blocked if payments exist (backend validation)
   - Sync conflict resolved by rejecting deletion

3. **Concurrent Transaction Edits**: Multiple devices edit same debt-linked transaction
   - Each edit creates its own reversal and new payment
   - Event sourcing maintains complete history
   - Vector clocks determine final state

### Data Integrity Scenarios

4. **Partial Reversals**: Transaction amount reduced (e.g., ₱500 → ₱300)
   - Creates reversal for -₱500
   - Creates new payment for ₱300
   - Net effect: -₱200 to debt balance

5. **Account/Member/Category Deletion**: Referenced entity is deleted
   - **Warning before deletion**: UI shows confirmation dialog if entity has active internal debts
   - **Example**: "This category is referenced by 3 active debt(s). Deleting will make these references stale. Continue?"
   - Internal debts: No foreign key constraints, references become stale after confirmation
   - Display names (cached at creation) remain visible for history
   - Debt remains trackable, entity link points to deleted entity ID
   - UI shows tooltip: "'CategoryName' (entity no longer exists)"
   - Phase B: Background job can detect and flag orphaned references for manual review

6. **Transaction Deletion Creates Reversal**:
   - When transaction deleted, a reversal payment is automatically created FIRST
   - Reversal has negative amount to undo the original payment
   - Then the transaction is soft deleted (sets `deleted_at` timestamp)
   - **Key**: Both payment records AND soft deleted transactions remain in database for complete audit trail
   - Debt balance automatically adjusts to reflect the reversal
   - This design ensures debt integrity and full audit trail with soft delete transactions

### Validation Edge Cases

7. **Zero-Amount Payments**: Blocked at database level (CHECK constraint)
8. **Self-Borrowing**: Internal debt where from_id = to_id blocked
9. **Negative Payments**: Used only for reversals, not direct creation
10. **Currency Overflow**: Capped at ₱9,999,999.99 per system limits

### Advanced Edge Cases

11. **Transaction Edited to Remove Debt Link**:
    - Original transaction had `debt_id: 'xyz'`, edit changes to `debt_id: null`
    - Creates reversal payment for original debt
    - Payment history shows: original payment, then reversal
    - Debt balance automatically adjusts
    - Orphaned payment records remain for audit trail

12. **Debt Archived with Pending Payments in Sync Queue**:
    - Debt archived while offline payments are queued
    - Queued payments sync when device comes online
    - **Acceptance Rule**: Payment accepted ONLY if `payment_date <= debt.closed_at` (payment dated before or on archive date)
    - Payments dated after `closed_at` are rejected during sync with error: "Cannot add payment to archived debt dated after closure"
    - Accepted payments do not change debt status (archived is terminal in MVP)
    - This preserves audit trail integrity while preventing backdating abuse
    - **UI Behavior**: When creating payment, UI prevents selecting archived debts from dropdown
    - **Sync Behavior**: Server validates `payment_date` against `closed_at` timestamp during sync processing
    - Note: Manual reactivation is deferred to Phase 2

13. **Internal Debt Entity Type Change**:
    - Scenario: Internal debt references "Groceries" category, which is later converted to account
    - Debt retains original cached values: `from_type: 'category', from_display_name: 'Groceries'`
    - Entity reference becomes stale (points to deleted category)
    - Display name preserved via cache (shows "Groceries" with tooltip)
    - No automated migration - soft references allow this staleness
    - Phase B: Background job can detect and flag for manual review

14. **Payment Exceeding PHP System Maximum**:
    - Validation blocks payments > ₱9,999,999.99
    - Error shown: "Payment exceeds maximum allowed amount"
    - User must split into multiple smaller payments
    - Applies to both creation and edits

15. **Timezone Handling for Payment Dates**:
    - Payment `payment_date` field is DATE type (no timezone)
    - Stored as user's local date (canonical for financial context)
    - Audit `created_at` timestamp is TIMESTAMPTZ (UTC)
    - Month boundaries use user's timezone from `profiles.timezone`
    - See DATABASE.md:932-1004 for date strategy rationale

## UI/UX Specifications

### Overpayment Warning Display

**Context**: Transaction form when amount exceeds debt balance

**Trigger**: User enters payment amount > current debt balance

**UI Elements**:

```tsx
<Alert severity="warning" dismissible={false}>
  <AlertIcon name="alert-triangle" />
  <AlertTitle>Payment Exceeds Balance</AlertTitle>
  <AlertDescription>
    Payment of {formatPHP(paymentAmount)} exceeds remaining balance of {formatPHP(currentBalance)}.
    The excess amount of {formatPHP(overpaymentAmount)} will be tracked as an overpayment.
  </AlertDescription>
  <AlertActions>
    <Button variant="outline" onClick={adjustToBalance}>
      Adjust to Balance
    </Button>
    <Button variant="default" type="submit">
      Continue Anyway
    </Button>
  </AlertActions>
</Alert>
```

**Placement**: Between amount field and submit button (inline validation)

**Behavior**:

- Shows immediately when amount changes (debounced 300ms)
- Warning is non-blocking (user can still submit)
- "Adjust to Balance" button auto-fills exact balance amount
- Remains visible until amount is adjusted or form is submitted

**Keyboard Navigation**:

- Tab key cycles focus between "Adjust to Balance" and "Continue Anyway" buttons
- Enter on "Adjust to Balance" auto-fills exact balance and closes warning
- Enter on "Continue Anyway" submits form with overpayment
- Escape does NOT dismiss warning (non-dismissible for data integrity)
- Arrow keys navigate between buttons (standard dialog navigation)
- Focus trap within alert actions while warning is displayed

**Accessibility**:

- `role="alert"` announces warning to screen readers
- `aria-live="polite"` for dynamic amount updates
- Buttons have clear, descriptive labels
- Color contrast meets WCAG 2.1 AA standards (warning orange)

---

### Archive Debt Dialog

**Trigger**: User clicks "Archive" button on debt detail page

**Dialog Content**:

```tsx
<Dialog>
  <DialogHeader>
    <DialogTitle>Archive "{debtName}"?</DialogTitle>
  </DialogHeader>
  <DialogBody>
    <p>Archiving this debt will:</p>
    <ul>
      <li>Hide it from active debt lists</li>
      <li>Preserve all payment history</li>
      <li>Prevent new payments dated after today (terminal state in MVP)</li>
      <li>Accept queued offline payments only if dated on or before today</li>
    </ul>

    {balance > 0 && (
      <Alert severity="warning">
        This debt still has a balance of {formatPHP(balance)}. Are you sure you want to archive it?
      </Alert>
    )}

    {balance < 0 && (
      <Alert severity="info">
        This debt is overpaid by {formatPHP(-balance)}. Archiving will preserve this overpayment
        record.
      </Alert>
    )}
  </DialogBody>
  <DialogFooter>
    <Button variant="outline" onClick={onCancel}>
      Cancel
    </Button>
    <Button variant="destructive" onClick={confirmArchive}>
      Archive Debt
    </Button>
  </DialogFooter>
</Dialog>
```

**Post-Archive**:

- Toast notification: "Debt archived successfully"
- Redirect to debts list
- Archived debt appears in "Archived" filter view

---

### Internal Debt Entity Selector

**Context**: Creating internal debt - selecting "from" and "to" entities

**UI Pattern**: Multi-step selector

**Step 1 - Entity Type Selection**:

```tsx
<RadioGroup label="What is borrowing?">
  <Radio value="category" icon="tag">
    <RadioLabel>Budget Category</RadioLabel>
    <RadioDescription>One category borrowing from another</RadioDescription>
  </Radio>
  <Radio value="account" icon="wallet">
    <RadioLabel>Account</RadioLabel>
    <RadioDescription>One account borrowing from another</RadioDescription>
  </Radio>
  <Radio value="member" icon="user">
    <RadioLabel>Household Member</RadioLabel>
    <RadioDescription>Individual member borrowing</RadioDescription>
  </Radio>
</RadioGroup>
```

**Step 2 - Entity Selection**:

```tsx
<FormField label={`Which ${fromType} is lending?`}>
  <Select>
    {entities.map(entity => (
      <SelectOption value={entity.id} key={entity.id}>
        <OptionLabel>{entity.name}</OptionLabel>
        {fromType === 'category' && entity.parent && (
          <OptionMeta>{entity.parent.name} → {entity.name}</OptionMeta>
        )}
      </SelectOption>
    ))}
  </Select>
</FormField>

<FormField label={`Which ${toType} is borrowing?`}>
  <Select>
    {/* Filter out the "from" entity to prevent self-borrowing */}
    {entities.filter(e => e.id !== fromId).map(entity => (
      <SelectOption value={entity.id} key={entity.id}>
        {entity.name}
      </SelectOption>
    ))}
  </Select>
</FormField>
```

**Validation Messages**:

- "Cannot borrow from the same entity" (if from_id === to_id)
- "{EntityType} not found" (if entity doesn't exist)

---

### Payment History with Overpayments

**Display Pattern**:

```tsx
<PaymentHistoryList>
  {payments.map((payment) => {
    // Check if this payment was reversed (another payment reverses it)
    const wasReversed = payments.some((p) => p.reverses_payment_id === payment.id);

    return (
      <PaymentItem key={payment.id}>
        <PaymentDate>{formatDate(payment.payment_date)}</PaymentDate>
        <PaymentAmount reversed={wasReversed}>
          {wasReversed && <s>{formatPHP(Math.abs(payment.amount_cents))}</s>}
          {!wasReversed && formatPHP(Math.abs(payment.amount_cents))}
        </PaymentAmount>

        {payment.is_overpayment && (
          <OverpaymentBadge>
            <Icon name="alert-circle" />
            Overpayment: {formatPHP(payment.overpayment_amount)}
          </OverpaymentBadge>
        )}

        {wasReversed && (
          <ReversedBadge>
            Reversed
            {/* Find the reversal payment to get its adjustment_reason */}
            {(() => {
              const reversal = payments.find((p) => p.reverses_payment_id === payment.id);
              return (
                reversal?.adjustment_reason && <Tooltip content={reversal.adjustment_reason} />
              );
            })()}
          </ReversedBadge>
        )}

        {payment.is_reversal && (
          <ReversalBadge>
            Reversal
            {payment.adjustment_reason && <Tooltip content={payment.adjustment_reason} />}
          </ReversalBadge>
        )}

        <PaymentMethod>
          {payment.transaction.transfer_group_id ? "Transfer" : "Expense"}
        </PaymentMethod>
      </PaymentItem>
    );
  })}
</PaymentHistoryList>
```

**Note**: To optimize performance and avoid O(n²) lookups, pre-compute reversed payment IDs:

```tsx
// Pre-compute set of reversed payment IDs for O(1) lookups
const reversedIds = new Set(
  payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id)
);

// Then check: reversedIds.has(payment.id)
```

**Running Balance Display**:

```tsx
<RunningBalance>
  Original: {formatPHP(debt.original_amount_cents)}
  Paid: {formatPHP(totalPaid)}
  Balance: {formatPHP(currentBalance)}
  {currentBalance < 0 && (
    <OverpaidIndicator>Overpaid by {formatPHP(-currentBalance)}</OverpaidIndicator>
  )}
</RunningBalance>
```

---

### Stale Entity Name Tooltip

**Context**: Internal debt where referenced entity has been renamed or deleted

**Display Pattern**:

```tsx
<InternalDebtName>
  <EntityLabel>
    {currentName || cachedDisplayName}

    {currentName !== cachedDisplayName && (
      <Tooltip
        content={
          currentName
            ? `Originally '${cachedDisplayName}', now '${currentName}'`
            : `'${cachedDisplayName}' (entity no longer exists)`
        }
      >
        <InfoIcon className="text-muted-foreground cursor-help" />
      </Tooltip>
    )}
  </EntityLabel>
</InternalDebtName>
```

**Visual Treatment**:

- Normal text if name matches
- Underline with dotted border if renamed (indicates tooltip available)
- Strike-through + "(deleted)" if entity no longer exists

---

### Empty States

**No Debts**:

```tsx
<EmptyState
  icon="receipt"
  title="No Debts Yet"
  description="Track external loans or internal household borrowing"
>
  <Button onClick={createDebt}>Add Your First Debt</Button>
</EmptyState>
```

**No Payments**:

```tsx
<EmptyState
  icon="coins"
  title="No Payments Recorded"
  description="Link transactions to this debt to track payments automatically"
>
  <Button onClick={createTransaction}>Record a Payment</Button>
</EmptyState>
```

**All Debts Paid Off**:

```tsx
<EmptyState
  icon="check-circle"
  title="All Debts Paid Off! 🎉"
  description="You have no active debts. Great job!"
/>
```

## Security & Validation

### Rate Limiting

**Enforcement Strategy**: MVP implements database-level absolute limits using triggers. Per-hour rate limiting is deferred to Phase B to reduce initial complexity.

**Debt Creation**:

- Max 100 total debts per household ✅ **Enforced by database trigger (MVP)**
- Max 10 debts created per hour per user ⏸️ **Deferred to Phase B**
- Error: "Maximum debt limit (100) reached for household"

**Payment Creation**:

- Max 100 payments per debt ✅ **Enforced by database trigger (MVP)**
- Max 50 payments created per hour per user ⏸️ **Deferred to Phase B**
- Error: "Maximum payment limit (100) reached for this debt"

**Archive Operation**:

- Max 20 archive operations per hour per household ⏸️ **Deferred to Phase B**

**Note**: Per-hour rate limiting will be implemented in Phase B using IndexedDB timestamp tracking. Database triggers provide adequate protection for MVP by preventing absolute limit abuse.

**MVP Implementation**: Database triggers count existing records and reject inserts that exceed absolute limits (100 debts per household, 100 payments per debt). See debt-implementation.md:2073-2136 for trigger definitions.

### Maximum Counts

**Per Household**:

- Max 100 total debts (active + archived)
- Max 200 internal debts
- Max 10,000 total debt payments

**Validation**:

- Check on creation before allowing new debt
- Display count in UI: "45 / 100 debts"
- Warning at 80% capacity: "You're running low on available debt slots"

### Audit Logging

**Logged Operations** (via events table):

- Debt creation/deletion/archive
- Internal debt creation/deletion
- Debt status changes (active → paid_off → archived)
- Payment reversals

**Log Fields** (from events table):

- `actor_user_id`: Who performed the action
- `device_id`: Which device
- `created_at`: When (TIMESTAMPTZ)
- `operation`: What happened (create/update/delete)
- `payload`: Changed fields

**Audit Query Example**:

```sql
-- Who archived debt XYZ?
SELECT
  e.created_at,
  p.email AS actor_email,
  e.device_id,
  e.payload->>'status' AS new_status
FROM events e
JOIN profiles p ON p.id = e.actor_user_id
WHERE e.entity_type = 'debt'
  AND e.entity_id = 'debt-xyz'
  AND e.op = 'update'
  AND e.payload->>'status' = 'archived'
ORDER BY e.created_at DESC;
```

### Permission Model

**MVP**: All household members have full access

- Any member can create/edit/delete/archive debts
- Any member can create payments
- All internal debts are household-visible

**Future** (Phase 2):

- Personal internal debts (visibility scoped to owner)
- Permission roles (admin, member, viewer)
- Approval workflow for large debt payments

## Related Documentation

- [Technical Implementation](./debt-implementation.md) - Sync, events, and architecture details
- [Decision Log](./DEBT-DECISIONS.md) - Architectural decisions and rationale
- [Validation Rules](./DEBT-VALIDATION.md) - Complete validation and state machine
- [DATABASE.md](../../initial%20plan/DATABASE.md) - Full database schema
- [SYNC-ENGINE.md](../../initial%20plan/SYNC-ENGINE.md) - Offline sync architecture
