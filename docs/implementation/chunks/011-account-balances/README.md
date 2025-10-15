# Chunk 011: Account Balances

## At a Glance

- **Time**: 60 minutes
- **Milestone**: MVP (8 of 11)
- **Prerequisites**: Chunks 005 (accounts), 009 (transactions)
- **Can Skip**: No - essential for account reconciliation

## What You're Building

Account balance calculation system with cleared/pending split:

- **Running Balance**: Current balance including all transactions
- **Cleared Balance**: Balance from cleared transactions only
- **Pending Balance**: Amount from pending transactions
- **Balance Component**: Reusable balance display widget
- **Account List**: Enhanced with balance information
- **Per-Account View**: Detailed transaction list with running balance

## Why This Matters

Account balances are **critical for financial tracking**:

- Users need to know "how much money do I have?"
- Bank reconciliation requires matching cleared balance
- Pending transactions show upcoming changes
- Running balance helps identify discrepancies

Without accurate balances, the app is useless for financial management.

## Before You Start

Make sure you have:

- Chunks 001-009 completed
- Accounts table with initial_balance_cents
- Transactions linked to accounts
- formatPHP utility (chunk 006)
- Supabase RLS policies active

## What Happens Next

After this chunk:

- Account list shows current balances
- Balances split by cleared/pending
- Each account page shows running balance
- Balance component reusable across app
- Bank reconciliation possible
- **Core balance tracking complete!**

## Key Files Created

```
src/
├── routes/
│   ├── accounts/
│   │   └── $accountId.tsx          # Account detail page
│   └── accounts.tsx                # Accounts list with balances
├── components/
│   ├── AccountBalance.tsx          # Balance display component
│   ├── AccountBalanceCard.tsx      # Card widget for balances
│   └── AccountTransactionList.tsx  # Transactions with running balance
└── lib/
    └── supabaseQueries.ts          # useAccountBalance hook
```

## Features Included

### Balance Calculation

- **Current Balance**: initial_balance + income - expenses
- **Cleared Balance**: initial_balance + cleared income - cleared expenses
- **Pending Balance**: pending income - pending expenses
- **Running Balance**: Calculate balance at each transaction

### Balance Display

- Total balance (large, prominent)
- Cleared amount (green)
- Pending amount (yellow/orange)
- Visual indicators (icons)
- Color coding (positive/negative)

### Account List Enhancements

- Balance shown on each account card
- Sort by balance
- Filter by account type
- Visual balance indicators
- Quick navigation to account detail

### Per-Account View

- Transaction list for specific account
- Running balance column
- Cleared/pending badges
- Date range filter
- Status toggle quick action

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 356-395 (Account Balance Query)
- **Original**: `docs/initial plan/DATABASE.md` lines 736-776 (Calculate Running Total Function)
- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 6 (lines 237-262)
- **Decisions**: #9 (amount storage - positive with type field)

## Technical Stack

- **TanStack Query**: Balance queries with caching
- **Supabase**: Database queries for balances
- **Recharts**: Optional balance history chart
- **formatPHP**: Currency formatting (chunk 006)
- **date-fns**: Date manipulation

## Design Patterns

### Balance Query Pattern

```typescript
// Real-time balance calculation
const { data: balance } = useAccountBalance(accountId);

// Returns:
// {
//   currentBalance: 150000, // cents
//   clearedBalance: 145000,
//   pendingBalance: 5000,
//   transactionCount: 42
// }
```

### Running Balance Pattern

```typescript
// Calculate running balance as you iterate transactions
let runningBalance = account.initial_balance_cents;

transactions.forEach((t) => {
  if (t.type === "income") {
    runningBalance += t.amount_cents;
  } else {
    runningBalance -= t.amount_cents;
  }
  t.runningBalance = runningBalance;
});
```

### Balance Component Pattern

```typescript
<AccountBalance
  currentBalance={150000}
  clearedBalance={145000}
  pendingBalance={5000}
  size="large" // or "small"
/>
```

## Common Pitfalls

1. **Forgetting transfers**: Transfers MUST be included in balance calculations (unlike analytics)
2. **Wrong initial balance**: Must fetch from accounts table
3. **Type confusion**: Income adds, expense subtracts
4. **Pending vs cleared**: Must split for reconciliation
5. **Currency precision**: Always use cents, never floats

## Performance Considerations

**Query Optimization** (see DATABASE.md lines 406-428):

- Use compound index: `idx_transactions_account_date`
- Filter by account_id first
- Order by date DESC for recent transactions
- INCLUDE transfers in balance (critical difference from analytics)

**Target Performance**: <30ms per account balance query

---

**Ready?** → Open `INSTRUCTIONS.md` to begin
