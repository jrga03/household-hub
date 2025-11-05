# Transfer Components (`/src/components/transfers/`)

## Purpose

Transfer management components for moving money **between accounts**. Transfers create paired transactions that must be excluded from analytics to avoid double-counting.

## Directory Contents

**2 component files** (6.9 KB total):

- **`TransferForm.tsx`** (175 lines, 5.2K) - Form for creating transfers with validation
- **`TransferList.tsx`** (50 lines, 1.7K) - List of recent transfers with visual flow indicators

## Component Overview

### TransferForm.tsx

**Purpose:** Create transfers between accounts with automatic paired transaction creation and cross-account validation.

**Form fields:**

1. **From Account** (Select, required)
   - Dropdown of all accounts
   - Cannot be same as "To Account"

2. **To Account** (Select, required)
   - Dropdown of all accounts
   - Validated against "From Account"

3. **Amount** (CurrencyInput, required)
   - PHP currency input
   - Must be positive (> 0)
   - Stored as integer cents

4. **Date** (date input, defaults to today)
   - Transfer effective date
   - ISO format (YYYY-MM-DD)

5. **Description** (text input, optional)
   - Defaults to "Transfer between accounts"
   - User can provide custom description

**Validation rules:**

**Lines 17-28** - Zod schema with custom refinement:

```typescript
.refine((data) => data.from_account_id !== data.to_account_id, {
  message: "Cannot transfer to same account",
  path: ["to_account_id"],
})
```

**Validation constraints:**

- From account required
- To account required
- Amount must be positive (>= 1 cent)
- Date required
- **Custom rule:** From account ≠ To account

**Lines 53-82** - `onSubmit` handler:

1. **Find account names:** Looks up account names from IDs
2. **Call mutation:** `useCreateTransfer` hook
3. **Success toast:** "Transfer created successfully"
4. **Form reset:** Clears form (except date defaults to today)
5. **Callback:** Calls optional `onSuccess` prop

**Critical:** Transfer creation happens via hook, not direct API call

**Props:**

```typescript
{
  accounts: Array<{ id: string; name: string }>;
  householdId: string;
  userId: string;
  onSuccess?: () => void;
}
```

### TransferList.tsx

**Purpose:** Display list of transfers with visual flow indicator showing direction of money movement.

**Visual structure:**

```
┌─────────────────────────────────────────────┐
│ Checking → Savings           ₱5,000.00     │
│                              2024-01-15     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Savings → Investment         ₱10,000.00    │
│                              2024-01-10     │
└─────────────────────────────────────────────┘
```

**Visual elements:**

- **From account name** (left, font-medium)
- **Arrow icon** (→, muted)
- **To account name** (right of arrow, font-medium)
- **Amount** (right side, bold, PHP formatted)
- **Date** (below amount, muted, localized format)

**Loading state:**

- Message: "Loading transfers..."
- Centered with muted text

**Empty state:**

- Message: "No transfers found"
- Subtext: "Create your first transfer to move money between accounts"
- Centered, two-line layout

**Props:**

```typescript
{
  householdId: string;
}
```

**Data fetching:**

- Uses `useTransfers(householdId)` hook
- Handles loading and empty states
- No pagination (shows all transfers)

## Transfer Architecture

### Paired Transaction Pattern

**Critical concept:** Each transfer creates **two linked transactions**:

1. **Expense transaction** (from account)
   - Type: 'expense'
   - Account: from_account_id
   - Amount: amount_cents

2. **Income transaction** (to account)
   - Type: 'income'
   - Account: to_account_id
   - Amount: amount_cents (same amount)

**Both share:** `transfer_group_id` (UUID)

**Database implementation:**

```sql
-- Expense side
INSERT INTO transactions (
  account_id, amount_cents, type, transfer_group_id, ...
) VALUES (
  from_account_id, amount_cents, 'expense', gen_random_uuid(), ...
);

-- Income side (same transfer_group_id)
INSERT INTO transactions (
  account_id, amount_cents, type, transfer_group_id, ...
) VALUES (
  to_account_id, amount_cents, 'income', transfer_group_id, ...
);
```

**Why paired?**

- Maintains double-entry bookkeeping
- Each account's balance reflects the transfer
- Can query either transaction to find the pair

### Analytics Exclusion (CRITICAL)

**ALL analytics queries MUST exclude transfers:**

```sql
WHERE transfer_group_id IS NULL
```

**Why exclude?**

- Transfer from Checking to Savings counts as:
  - Expense from Checking
  - Income to Savings
- Including in analytics would show:
  - Total expenses inflated
  - Total income inflated
  - Net effect is zero (correct), but components are wrong

**Examples of queries that MUST exclude:**

- Budget vs actual calculations
- Category spending totals
- Monthly expense reports
- Income/expense charts

**Enforced in:**

- Backend RPC functions
- TanStack Query hooks
- NOT in these UI components (separation of concerns)

## Data Flow

### Transfer Creation Flow

```
User fills TransferForm
  ↓
Clicks "Create Transfer"
  ↓
onSubmit validates data
  ↓
Looks up account names from IDs
  ↓
Calls useCreateTransfer hook
  ↓
Hook sends to backend:
  {
    from_account_id,
    to_account_id,
    amount_cents,
    from_account_name,
    to_account_name,
    description,
    date,
    household_id,
    user_id
  }
  ↓
Backend creates 2 transactions:
  1. Expense (from account)
  2. Income (to account)
  Both with same transfer_group_id
  ↓
Hook invalidates queries
  ↓
TransferList re-fetches
  ↓
New transfer appears in list
  ↓
Success toast displayed
  ↓
Form resets
```

### Transfer Query Flow

```
TransferList mounts
  ↓
useTransfers(householdId) hook
  ↓
Backend query:
  SELECT * FROM transfers
  WHERE household_id = $1
  ORDER BY date DESC
  ↓
Returns transfers with:
  - id (transfer_group_id)
  - from_account_name
  - to_account_name
  - amount_cents
  - date
  ↓
TransferList renders cards
```

## Integration Points

### Hooks

**`useCreateTransfer`** - Mutation hook for creating transfers

- Location: `src/hooks/useTransfers.ts`
- Returns: Mutation with `mutateAsync` and `isPending` state
- Invalidates: `["transfers"]` query key on success

**`useTransfers(householdId)`** - Query hook for fetching transfers

- Location: `src/hooks/useTransfers.ts`
- Returns: `{ data, isLoading, error }`
- Data: Array of transfer objects

### UI Components

**CurrencyInput** - Custom currency input with PHP prefix

- Location: `src/components/ui/currency-input.tsx`
- Accepts: Value in cents
- Displays: PHP formatted with ₱ prefix

**Select** - shadcn/ui dropdown

- Used for: From/To account selection
- Controlled via: React Hook Form Controller

**Card** - shadcn/ui card wrapper

- Used in: TransferList for each transfer item

### Utilities

**`formatPHP(cents)`** - Currency formatting

- Location: `src/lib/currency.ts`
- Input: Integer cents
- Output: "₱X,XXX.XX"

### Validation

**React Hook Form** - Form state management

- Zod resolver for schema validation
- Controller for Select components
- Direct registration for simple inputs

**Sonner** - Toast notifications

- Success: "Transfer created successfully"
- Error: "Failed to create transfer" / "Invalid account selection"

## Key Features

### 1. Same-Account Prevention

**Lines 25-28** - Custom Zod refinement prevents transferring to same account

**Why important?**

- Logically invalid (moving money to same place)
- Would create confusing paired transactions
- Could break balance calculations

**User experience:**

- Error shown on "To Account" field
- Message: "Cannot transfer to same account"
- Must select different account to proceed

### 2. Automatic Description

**Line 68:**

```typescript
description: data.description || `Transfer between accounts`;
```

**Behavior:**

- User can provide custom description
- If empty, defaults to generic description
- Improves transfer history readability

### 3. Form Reset After Success

**Lines 73-76:**

```typescript
form.reset({
  date: new Date().toISOString().split("T")[0],
  amount_cents: 0,
});
```

**Smart reset:**

- Clears account selections
- Clears amount
- **Keeps date as today** (common use case)
- Ready for next transfer

### 4. Visual Transfer Direction

**TransferList ArrowRight icon** - Shows money flow direction

**Benefits:**

- Instant visual comprehension
- No need to read "from/to" labels
- Arrow universally understood

### 5. Loading and Empty States

**TransferList handles three states:**

- Loading: Centered message
- Empty: Encouraging message with call-to-action
- Data: Card list

**User experience:**

- Never shows blank screen
- Always communicates current state
- Empty state encourages action

## Common Use Cases

### 1. Moving Money to Savings

User wants to save ₱5,000:

1. Open Transfers page
2. Fill TransferForm:
   - From: Checking
   - To: Savings
   - Amount: 5000
   - Date: Today
3. Click "Create Transfer"
4. See success toast
5. Transfer appears in list
6. Account balances updated

### 2. Paying Credit Card from Checking

User pays ₱15,000 credit card bill:

1. Fill TransferForm:
   - From: Checking
   - To: Credit Card
   - Amount: 15000
   - Description: "Credit card payment"
2. Create transfer
3. Checking balance decreases ₱15,000
4. Credit Card balance increases ₱15,000 (reduces debt)

### 3. Reviewing Recent Transfers

User wants to see transfer history:

1. Open Transfers page
2. TransferList shows all transfers
3. See chronological list (newest first)
4. Each transfer shows from→to flow and amount

## Validation & Constraints

### Form Validation

**Required fields:**

- From Account
- To Account
- Amount (> 0)
- Date

**Optional fields:**

- Description

**Custom validation:**

- From Account ≠ To Account

### Business Logic Validation

**Amount constraints:**

- Must be positive (>= 1 cent)
- Maximum: 999,999,999 cents (₱9,999,999.99)
- Enforced by: CurrencyInput component and database

**Account constraints:**

- Both accounts must exist
- Both accounts must belong to same household
- Enforced by: Backend RLS policies

### Error Handling

**Form errors:**

- Display below each field
- Red text (text-destructive)
- Prevents submission

**API errors:**

- Caught in try/catch
- Display toast: "Failed to create transfer"
- Log to console for debugging

## UI/UX Patterns

### Form Layout

**Vertical stacking:**

- One field per row
- Labels above inputs
- Error messages below inputs
- Submit button at bottom

**Responsive:**

- Full width on mobile
- Can be placed in dialog or page

### Transfer List Layout

**Card-based:**

- One card per transfer
- Horizontal layout within card
- Left: From → To
- Right: Amount and date

**Spacing:**

- 2px gap between cards (space-y-2)
- 16px padding within cards (p-4)

### Color Coding

**None in transfers** (unlike transactions)

- Transfers are neutral (not income/expense for analytics)
- All transfers styled consistently
- No color differentiation needed

### Typography

**Transfer list:**

- Account names: font-medium (semi-bold)
- Amount: font-bold
- Date: text-sm text-muted-foreground

## Performance Considerations

### Form Performance

**React Hook Form optimization:**

- Uncontrolled inputs where possible
- Controller only for Select components
- Minimal re-renders

**Validation performance:**

- Zod schema validation runs on submit
- Client-side validation (instant feedback)
- No server round-trip for validation

### List Performance

**TransferList:**

- Simple card list (no virtualization needed)
- Typical use: 50-100 transfers (renders quickly)
- No pagination implemented (acceptable for MVP)

**Future optimization (if needed):**

- TanStack Virtual for 1000+ transfers
- Pagination or infinite scroll
- Filter by date range

## Critical Implementation Notes

### 1. Transfer Group ID

**Backend generates UUID** for `transfer_group_id`

- Same UUID used for both transactions
- Frontend doesn't need to generate this
- Backend ensures atomicity (both created or neither)

### 2. Account Name Passing

**Lines 56-62** - Form looks up account names:

**Why pass names?**

- Backend needs names for transaction descriptions
- Avoids additional database lookup in backend
- Frontend already has account list loaded

**Alternative:** Backend could look up names, but this is more efficient

### 3. Household and User IDs

**Props require explicit IDs:**

- `householdId` - Which household this transfer belongs to
- `userId` - Creator of the transfer

**Why not fetch from context?**

- Explicit dependencies (easier to test)
- Clear data flow
- Parent decides which IDs to use

### 4. Transfer List Query Key

**useTransfers hook likely uses:**

```typescript
queryKey: ["transfers", householdId];
```

**Invalidation on create:**

- `useCreateTransfer` invalidates this key
- TransferList automatically re-fetches
- New transfer appears without manual refresh

### 5. No Edit or Delete

**Current implementation:** Create-only

**Why?**

- Transfers are paired transactions
- Editing one requires editing both
- Deleting requires removing both
- Complex to implement correctly

**Future enhancement:**

- Add edit/delete with paired transaction handling
- Confirmation dialogs for delete
- Audit trail preservation

## Troubleshooting

### Issue: "Cannot transfer to same account" error persists

**Check:**

1. Are you actually selecting different accounts?
2. Is form validation working? (Check console for Zod errors)
3. Clear form and try again

### Issue: Transfer created but not appearing in list

**Check:**

1. Is `householdId` prop correct in TransferList?
2. Check browser console for query errors
3. Verify transfer was actually created (check transactions table)
4. Try manually refetching (reload page)

### Issue: Amount showing incorrectly

**Check:**

1. Is `formatPHP` being called on amount?
2. Is amount stored as cents in database?
3. Check `CurrencyInput` component for bugs

## Related Components

### Transaction Components

- [src/components/README.md](../README.md) - Transaction form/list (similar patterns)

**Difference:**

- Transactions: Single entry (income or expense)
- Transfers: Paired entries (expense + income)

### Hooks

- [src/hooks/useTransfers.ts](../../hooks/README.md) - Transfer data fetching and mutations

### Database

- [docs/initial plan/DATABASE.md](../../../docs/initial%20plan/DATABASE.md) - Lines 441-501: Transfer representation and exclusion patterns

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/components/README.md](../README.md) - Component architecture

### Architecture Decisions

- [docs/initial plan/DECISIONS.md](../../../docs/initial%20plan/DECISIONS.md) - Transfer design rationale

## Further Reading

- [Double-Entry Bookkeeping](https://en.wikipedia.org/wiki/Double-entry_bookkeeping) - Accounting principle behind transfers
- [React Hook Form Controller](https://react-hook-form.com/docs/usecontroller/controller) - Controlled component pattern
- [Zod Refinements](https://zod.dev/?id=refine) - Custom validation rules
