# Troubleshooting: Account Balances

Common issues with account balance calculations and display.

---

## Balance Calculation Issues

### Problem: Balance calculation incorrect

**Cause**: Wrong formula or type confusion

**Solution**:

```typescript
// CORRECT pattern:
transactions.forEach((t) => {
  const amount =
    t.type === "income"
      ? t.amount_cents // Income adds to balance
      : -t.amount_cents; // Expense subtracts from balance

  currentBalance += amount;
});

// WRONG - Don't do this:
// currentBalance += t.amount_cents; // ❌ Ignores type
```

---

### Problem: Initial balance not included

**Cause**: Forgot to start with account's initial balance

**Solution**:

```typescript
// CORRECT:
let currentBalance = account.initial_balance_cents;
transactions.forEach((t) => {
  currentBalance += calculateAmount(t);
});

// WRONG:
let currentBalance = 0; // ❌ Missing initial balance
```

---

### Problem: Transfers excluded from balance

**Cause**: Incorrectly filtering out transfers

**Solution**:

```typescript
// CORRECT - Include ALL transactions for balance:
const { data: transactions } = await supabase
  .from("transactions")
  .select("amount_cents, type, status")
  .eq("account_id", accountId);
// ↑ NO filter on transfer_group_id

// WRONG - Don't exclude transfers:
const { data: transactions } = await supabase
  .from("transactions")
  .select("amount_cents, type, status")
  .eq("account_id", accountId)
  .is("transfer_group_id", null); // ❌ Excludes transfers!
```

**Remember**: Balance queries are different from analytics queries. Transfers MUST be included in balances.

---

## Cleared vs Pending Issues

### Problem: Cleared/Pending split incorrect

**Cause**: Not separating by status properly

**Solution**:

```typescript
// CORRECT pattern:
let clearedBalance = account.initial_balance_cents;
let pendingBalance = 0;

transactions.forEach((t) => {
  const amount = t.type === "income" ? t.amount_cents : -t.amount_cents;

  if (t.status === "cleared") {
    clearedBalance += amount;
  } else {
    pendingBalance += amount; // Pending transactions separate
  }
});

// Current = Cleared + Pending
const currentBalance = clearedBalance + pendingBalance;
```

---

### Problem: Pending balance includes initial balance

**Cause**: Starting pending balance with non-zero value

**Solution**:

```typescript
// CORRECT:
let clearedBalance = account.initial_balance_cents; // ✓ Start here
let pendingBalance = 0; // ✓ Start at zero

// WRONG:
let clearedBalance = 0;
let pendingBalance = account.initial_balance_cents; // ❌
```

---

### Problem: Current balance doesn't match cleared + pending

**Cause**: Not calculating current correctly

**Solution**:

```typescript
// Option 1: Calculate current separately
let currentBalance = account.initial_balance_cents;
let clearedBalance = account.initial_balance_cents;
let pendingBalance = 0;

transactions.forEach((t) => {
  const amount = t.type === "income" ? t.amount_cents : -t.amount_cents;
  currentBalance += amount; // Add to current

  if (t.status === "cleared") {
    clearedBalance += amount;
  } else {
    pendingBalance += amount;
  }
});

// Option 2: Derive current from cleared + pending
const currentBalance = clearedBalance + pendingBalance;
```

---

## Transfer-Related Issues

### Problem: Transfer shows twice in balance

**Cause**: This is actually CORRECT for balances

**Explanation**:

```typescript
// Transfer from Checking to Savings creates TWO transactions:
// 1. Expense in Checking: -₱1,000 (decreases checking balance)
// 2. Income in Savings: +₱1,000 (increases savings balance)

// This is CORRECT behavior for balance calculation!
// Each account sees its side of the transfer.
```

**Solution**: This is not a bug. Transfers affect both account balances, which is the expected behavior.

---

### Problem: Total money across accounts changes after transfer

**Cause**: Likely a bug in transfer creation

**Solution**:

```typescript
// Verify transfer integrity:
// 1. Sum all account balances before transfer
const totalBefore = accounts.reduce((sum, a) => sum + a.balance, 0);

// 2. Create transfer
// 3. Sum all account balances after transfer
const totalAfter = accounts.reduce((sum, a) => sum + a.balance, 0);

// 4. Total should be UNCHANGED
console.assert(totalBefore === totalAfter, "Money disappeared!");
```

If totals don't match, check transfer transaction creation logic.

---

## Query Performance Issues

### Problem: Balance query slow with many transactions

**Cause**: Missing database index

**Solution**:
Ensure this index exists (see DATABASE.md lines 863-878):

```sql
CREATE INDEX idx_transactions_account_date
ON transactions(account_id, date DESC);
```

**Expected performance**: <30ms per account balance query

---

### Problem: Multiple queries for account list

**Cause**: Using useAccountBalance for each account individually

**Solution**:

```typescript
// WRONG - N+1 query problem:
{accounts.map(account => {
  const { data: balance } = useAccountBalance(account.id); // ❌ One query per account
  return <AccountCard balance={balance} />;
})}

// CORRECT - Single query for all:
const { data: balances } = useAccountBalances(); // ✓ One query for all accounts
{accounts.map(account => {
  const balance = balances?.find(b => b.accountId === account.id);
  return <AccountCard balance={balance} />;
})}
```

---

## Currency Formatting Issues

### Problem: Balance shows as number, not currency

**Cause**: Not using formatPHP utility

**Solution**:

```typescript
// WRONG:
<div>{currentBalance}</div> // ❌ Shows "150000"

// CORRECT:
import { formatPHP } from "@/lib/currency";
<div>{formatPHP(currentBalance)}</div> // ✓ Shows "₱1,500.00"
```

---

### Problem: Currency format inconsistent

**Cause**: Multiple formatting implementations

**Solution**:

```typescript
// ALWAYS use the same utility:
import { formatPHP } from "@/lib/currency";

// Everywhere in the app:
{
  formatPHP(amount);
}

// Never do this:
`₱${(amount / 100).toFixed(2)}`; // ❌ Missing thousands separator
```

---

### Problem: Rounding errors in balance

**Cause**: Using floats instead of integers

**Solution**:

```typescript
// CORRECT - Always use cents (integers):
const amount_cents = 150050; // ✓ Integer cents
const formatted = formatPHP(amount_cents); // "₱1,500.50"

// WRONG - Don't use floats:
const amount = 1500.5; // ❌ Float precision issues
```

---

## Component Display Issues

### Problem: Pending balance shows when zero

**Cause**: Not checking for zero before displaying

**Solution**:

```typescript
// CORRECT:
{pendingBalance !== 0 && (
  <div>
    <Clock className="h-3 w-3" />
    <span>Pending: {formatPHP(pendingBalance)}</span>
  </div>
)}

// WRONG - Always shows:
<div>
  <span>Pending: {formatPHP(pendingBalance)}</span> {/* Shows "₱0.00" */}
</div>
```

---

### Problem: Balance color not changing for negative

**Cause**: Not checking sign in className

**Solution**:

```typescript
// CORRECT:
const isPositive = currentBalance >= 0;

<div className={cn(
  "font-bold",
  isPositive
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400"
)}>
  {formatPHP(currentBalance)}
</div>

// WRONG - Always green:
<div className="text-green-600"> {/* ❌ Even when negative */}
  {formatPHP(currentBalance)}
</div>
```

---

### Problem: Balance size prop not working

**Cause**: Missing size variant in component

**Solution**:

```typescript
// Ensure size variants implemented:
<div className={cn(
  "font-mono",
  size === "large" ? "text-3xl" : "text-xl" // ✓ Both sizes
)}>
  {formatPHP(currentBalance)}
</div>
```

---

## Real-Time Update Issues

### Problem: Balance doesn't update after transaction change

**Cause**: React Query cache not invalidating

**Solution**:

```typescript
// After mutation (create/update/delete transaction):
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();

// Invalidate balance queries:
await queryClient.invalidateQueries({
  queryKey: ["account-balance", accountId],
});

// Or invalidate all account balances:
await queryClient.invalidateQueries({
  queryKey: ["account-balances"],
});
```

---

### Problem: Stale balance showing

**Cause**: staleTime too long

**Solution**:

```typescript
// In useAccountBalance hook:
return useQuery({
  queryKey: ["account-balance", accountId],
  queryFn: fetchBalance,
  staleTime: 30 * 1000, // ✓ 30 seconds is reasonable
  // staleTime: Infinity, // ❌ Never updates
});
```

---

## Type and Data Issues

### Problem: Transaction count doesn't match list

**Cause**: Mismatch between query filters

**Solution**:

```typescript
// ENSURE SAME QUERY for count and list:

// In useAccountBalance:
const { data: transactions } = await supabase
  .from("transactions")
  .select("amount_cents, type, status")
  .eq("account_id", accountId);
// ↑ NO additional filters

// Return accurate count:
return {
  transactionCount: transactions.length,
  clearedCount: transactions.filter((t) => t.status === "cleared").length,
  pendingCount: transactions.filter((t) => t.status === "pending").length,
};
```

---

### Problem: TypeScript error on balance fields

**Cause**: Missing interface definition

**Solution**:

```typescript
// Define proper interface:
export interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalance: number;
  currentBalance: number;
  clearedBalance: number;
  pendingBalance: number;
  transactionCount: number;
  clearedCount: number;
  pendingCount: number;
}

// Use in hook:
queryFn: async (): Promise<AccountBalance> => {
  // ...
};
```

---

## Loading State Issues

### Problem: Loading spinner flickers

**Cause**: Not handling loading state properly

**Solution**:

```typescript
const { data: balance, isLoading } = useAccountBalance(accountId);

// CORRECT:
if (isLoading) {
  return <LoadingSpinner />;
}

if (!balance) {
  return <ErrorState />;
}

return <BalanceDisplay balance={balance} />; // ✓ Only when loaded

// WRONG:
if (!balance) { // ❌ True during loading AND errors
  return <LoadingSpinner />;
}
```

---

### Problem: Balance component receives undefined

**Cause**: Not checking data before passing to component

**Solution**:

```typescript
// CORRECT:
const balance = balances?.find(b => b.accountId === account.id) || {
  currentBalance: account.initial_balance_cents || 0,
  clearedBalance: account.initial_balance_cents || 0,
  pendingBalance: 0,
};

<AccountBalance {...balance} />

// WRONG:
const balance = balances?.find(b => b.accountId === account.id);
<AccountBalance {...balance} /> {/* ❌ Might be undefined */}
```

---

## Navigation Issues

### Problem: Account card click doesn't navigate

**Cause**: Missing Link wrapper or wrong import

**Solution**:

```typescript
// CORRECT - TanStack Router Link:
import { Link } from "@tanstack/react-router";

<Link
  to="/accounts/$accountId"
  params={{ accountId: account.id }}
>
  <Card>...</Card>
</Link>

// WRONG - HTML anchor:
<a href={`/accounts/${account.id}`}> {/* ❌ Full page reload */}
  <Card>...</Card>
</a>
```

---

### Problem: Back button doesn't work

**Cause**: Using regular button instead of Link

**Solution**:

```typescript
// CORRECT:
import { Link } from "@tanstack/react-router";

<Link to="/accounts">
  <Button variant="ghost" size="sm">
    <ArrowLeft className="h-4 w-4" />
  </Button>
</Link>

// WRONG:
<Button onClick={() => window.history.back()}> {/* ❌ Unreliable */}
  <ArrowLeft />
</Button>
```

---

## Quick Fixes

```bash
# Force refetch balance data
# In browser console:
queryClient.invalidateQueries({ queryKey: ["account-balance"] });

# Check balance calculation
# Log intermediate values:
console.log({
  initial: account.initial_balance_cents,
  transactions: transactions.length,
  currentBalance,
  clearedBalance,
  pendingBalance,
});

# Verify transfer_group_id not filtered
# Check network tab → Supabase query should NOT have:
# "transfer_group_id.is.null"

# Test balance formula manually
const testBalance = transactions.reduce((sum, t) => {
  return sum + (t.type === "income" ? t.amount_cents : -t.amount_cents);
}, account.initial_balance_cents);
console.log("Manual balance:", testBalance);
```

---

## Database Query Debugging

```typescript
// Add logging to query:
console.log("Fetching balance for account:", accountId);

const { data: transactions, error } = await supabase
  .from("transactions")
  .select("amount_cents, type, status")
  .eq("account_id", accountId);

console.log("Found transactions:", transactions?.length);
console.log("Transactions:", transactions);

if (error) {
  console.error("Balance query error:", error);
}

// Check if transfers are included:
const transferCount = transactions?.filter((t) => t.transfer_group_id).length;
console.log("Transfers included:", transferCount);
```

---

## Common Mistakes Checklist

- [ ] Not including initial balance in calculation
- [ ] Excluding transfers from balance query
- [ ] Wrong sign for income/expense amounts
- [ ] Pending balance starting with initial_balance
- [ ] Not using formatPHP for currency display
- [ ] Using floats instead of integer cents
- [ ] Forgetting to invalidate cache after mutation
- [ ] N+1 query problem (using single query in loop)
- [ ] Not checking for zero pending before displaying
- [ ] Missing color change for negative balances

---

## Performance Checklist

- [ ] `idx_transactions_account_date` index exists
- [ ] Using `useAccountBalances` for list (not multiple `useAccountBalance`)
- [ ] staleTime configured (30s recommended)
- [ ] Queries complete in <30ms
- [ ] No unnecessary re-renders
- [ ] Virtual scrolling for transaction lists (if 100+ items)

---

**Remember**:

1. **Transfers MUST be included** in balance calculations (unlike analytics)
2. **Always use cents** (integers) for amounts
3. **Initial balance is the starting point** for all calculations
4. **Cleared + Pending = Current** balance
5. **formatPHP** for all currency displays

---

**Need more help?** Check:

- DATABASE.md lines 356-395 (Account Balance Query pattern)
- DATABASE.md lines 736-776 (Calculate Running Total Function)
- DECISIONS.md #9 (Amount storage strategy)
