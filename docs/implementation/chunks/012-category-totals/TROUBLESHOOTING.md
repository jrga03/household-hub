# Troubleshooting: Category Totals

Common issues with category analytics and spending analysis.

---

## Transfer Inclusion Issues

### Problem: Category totals too high - includes transfers

**Cause**: Not excluding transfers from analytics query

**Solution**:

```typescript
// CORRECT - Exclude transfers:
const { data: transactions } = await supabase
  .from("transactions")
  .select("category_id, amount_cents, type")
  .is("transfer_group_id", null) // ✓ Exclude transfers
  .gte("date", monthStart)
  .lte("date", monthEnd);

// WRONG - Includes transfers:
const { data: transactions } = await supabase
  .from("transactions")
  .select("category_id, amount_cents, type")
  // ❌ Missing transfer exclusion
  .gte("date", monthStart);
```

**Remember**: Analytics queries are different from balance queries. Always exclude transfers from spending analytics.

---

### Problem: Can't tell which transactions are transfers

**Cause**: Not checking transfer_group_id field

**Solution**:

```typescript
// Check if transaction is a transfer:
if (transaction.transfer_group_id !== null) {
  // This is a transfer - exclude from analytics
  return;
}

// Or in SQL:
WHERE transfer_group_id IS NULL
```

---

## Parent Rollup Issues

### Problem: Parent total doesn't match sum of children

**Cause**: Incorrect rollup calculation

**Solution**:

```typescript
// CORRECT pattern:
const parentTotal = children.reduce((sum, child) => sum + child.expenseCents, 0);

// Verify:
const childSum = group.children.reduce((s, c) => s + c.expenseCents, 0);
console.assert(group.totalExpenseCents === childSum, "Parent total must equal sum of children");
```

---

### Problem: Parent categories have direct transactions

**Expected**: This is wrong! Only child categories should have transactions.

**Solution**:

```typescript
// In category totals query:
categories.forEach((category) => {
  // Skip parent categories
  if (!category.parent_id) {
    // Initialize parent group but don't add transactions
    return;
  }

  // Only child categories process transactions
  const totals = totalsMap.get(category.id);
  // ...
});
```

**Database Check**:

```sql
-- Find parent categories with transactions (shouldn't happen):
SELECT c.name, COUNT(t.id) as transaction_count
FROM categories c
LEFT JOIN transactions t ON t.category_id = c.id
WHERE c.parent_id IS NULL
  AND t.id IS NOT NULL
GROUP BY c.id, c.name;
```

---

## Calculation Issues

### Problem: Percentages don't sum to 100%

**Cause**: Rounding or calculation error

**Solution**:

```typescript
// Calculate total first:
const totalSpending = Array.from(totalsMap.values()).reduce((sum, t) => sum + t.expense, 0);

// Then calculate percentages:
const percentOfTotal = totalSpending > 0 ? (totals.expense / totalSpending) * 100 : 0;

// Verify sum (allow small rounding difference):
const percentSum = categories.reduce((sum, c) => sum + c.percentOfTotal, 0);
console.assert(Math.abs(percentSum - 100) < 0.1, `Percentages sum to ${percentSum}, expected ~100`);
```

---

### Problem: Division by zero error

**Cause**: No spending in month

**Solution**:

```typescript
// CORRECT - Check for zero:
const percentOfTotal = totalSpending > 0 ? (expenseCents / totalSpending) * 100 : 0; // ✓ Return 0 if no spending

// WRONG:
const percentOfTotal = (expenseCents / totalSpending) * 100; // ❌ NaN if totalSpending is 0
```

---

### Problem: Negative totals appearing

**Cause**: Mixing income and expense, or wrong amount sign

**Solution**:

```typescript
// CORRECT - Separate income and expense:
if (t.type === "expense") {
  existing.expense += t.amount_cents; // Amount already positive
} else {
  existing.income += t.amount_cents; // Amount already positive
}

// WRONG - Don't subtract:
const total = income - expense; // ❌ Creates negative numbers
```

---

## Month Boundary Issues

### Problem: Transactions from wrong month showing

**Cause**: Incorrect month calculation

**Solution**:

```typescript
import { startOfMonth, endOfMonth, format } from "date-fns";

// CORRECT:
const monthStart = startOfMonth(selectedMonth);
const monthEnd = endOfMonth(selectedMonth);

query.gte("date", format(monthStart, "yyyy-MM-dd")).lte("date", format(monthEnd, "yyyy-MM-dd"));

// WRONG - Manual calculation:
const start = `${year}-${month}-01`; // ❌ Doesn't handle month boundaries
const end = `${year}-${month}-31`; // ❌ Not all months have 31 days
```

---

### Problem: Month comparison shows wrong previous month

**Cause**: Not using date-fns subMonths

**Solution**:

```typescript
import { subMonths } from "date-fns";

// CORRECT:
const previousMonth = subMonths(selectedMonth, 1);
// Handles year boundaries automatically

// WRONG:
const previousMonth = new Date(
  selectedMonth.getFullYear(),
  selectedMonth.getMonth() - 1 // ❌ Breaks at year boundary
);
```

---

## Data Loading Issues

### Problem: Data doesn't update when month changes

**Cause**: Query key not including month

**Solution**:

```typescript
// CORRECT - Include month in query key:
return useQuery({
  queryKey: ["category-totals", format(month, "yyyy-MM")],
  queryFn: async () => {
    /* ... */
  },
});

// WRONG - Static query key:
return useQuery({
  queryKey: ["category-totals"], // ❌ Doesn't invalidate on month change
  queryFn: async () => {
    /* ... */
  },
});
```

---

### Problem: Stale data showing after transaction changes

**Cause**: Cache not invalidating

**Solution**:

```typescript
// After transaction mutation:
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();

// Invalidate category totals:
await queryClient.invalidateQueries({
  queryKey: ["category-totals"],
});
```

---

## Comparison Issues

### Problem: Previous month comparison not showing

**Cause**: Not fetching previous month data

**Solution**:

```typescript
// Fetch both months:
const current = useCategoryTotals(selectedMonth);
const previous = useCategoryTotals(previousMonth);

// Match categories:
const previousChild = previousMonthData?.children.find((c) => c.categoryId === child.categoryId);
```

---

### Problem: Comparison percentage wrong

**Cause**: Incorrect percentage change formula

**Solution**:

```typescript
// CORRECT:
const change = previousAmount > 0 ? ((currentAmount - previousAmount) / previousAmount) * 100 : 0;

// Test cases:
// Current: 5000, Previous: 4000 → +25% increase
// Current: 3000, Previous: 5000 → -40% decrease
// Current: 5000, Previous: 0 → 0% (or handle specially)
```

---

## Hierarchy Issues

### Problem: Children appearing without parent

**Cause**: Orphaned categories or missing parent reference

**Solution**:

```typescript
// Handle uncategorized children:
const parent = categories.find((c) => c.id === category.parent_id);
const parentKey = category.parent_id;

if (!parentMap.has(parentKey)) {
  parentMap.set(parentKey, {
    parentId: parentKey,
    parentName: parent?.name || "Uncategorized", // ✓ Fallback
    parentColor: parent?.color || "#6B7280",
    totalExpenseCents: 0,
    children: [],
  });
}
```

---

### Problem: Duplicate parent groups

**Cause**: Map key inconsistency

**Solution**:

```typescript
// Use consistent key:
const parentKey = category.parent_id; // ✓ Always use parent_id

// Not:
const parentKey = parent?.id; // ❌ Might be undefined
```

---

## Display Issues

### Problem: Progress bar not showing color

**Cause**: CSS variable not set

**Solution**:

```typescript
// CORRECT - Set custom property:
<Progress
  value={percentOfTotal}
  style={{
    // @ts-ignore
    "--progress-background": category.color
  }}
/>

// Ensure CSS uses variable:
.progress-bar {
  background-color: var(--progress-background, currentColor);
}
```

---

### Problem: Currency not formatting

**Cause**: Not using formatPHP utility

**Solution**:

```typescript
import { formatPHP } from "@/lib/currency";

// CORRECT:
{
  formatPHP(expenseCents);
} // "₱1,500.50"

// WRONG:
{
  expenseCents;
} // 150050 (raw cents)
{
  expenseCents / 100;
} // 1500.5 (missing currency symbol and formatting)
```

---

## Performance Issues

### Problem: Slow query with many transactions

**Cause**: Missing indexes

**Solution**:
Ensure these indexes exist (see DATABASE.md):

```sql
CREATE INDEX idx_transactions_category_date
ON transactions(category_id, date DESC);

CREATE INDEX idx_transactions_month
ON transactions(DATE_TRUNC('month', date));
```

**Expected**: <100ms for 1000 transactions/month

---

### Problem: Re-fetching on every render

**Cause**: staleTime too low

**Solution**:

```typescript
return useQuery({
  queryKey: ["category-totals", monthKey],
  queryFn: fetchTotals,
  staleTime: 60 * 1000, // ✓ 1 minute is reasonable
  // staleTime: 0,  // ❌ Refetches constantly
});
```

---

## Empty State Issues

### Problem: Empty state flickers

**Cause**: Not handling loading state

**Solution**:

```typescript
if (isLoading) {
  return <LoadingSpinner />;
}

if (!data || data.length === 0) {
  return <EmptyState />;
}

return <CategoryList data={data} />;  // ✓ Only when loaded
```

---

### Problem: Shows categories with no spending

**Cause**: Including all categories regardless of transactions

**Solution**:

```typescript
// Option 1: Filter out zero-spend categories
const groupsWithSpending = data.filter(
  group => group.totalExpenseCents > 0
);

// Option 2: Show all but style differently
<CategoryCard
  category={child}
  className={child.expenseCents === 0 ? "opacity-50" : ""}
/>
```

---

## TypeScript Issues

### Problem: Type error on category data

**Cause**: Missing interface definition

**Solution**:

```typescript
export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  parentName: string | null;
  color: string;
  expenseCents: number;
  incomeCents: number;
  transactionCount: number;
  percentOfTotal: number;
}

export interface CategoryTotalGroup {
  parentId: string | null;
  parentName: string;
  parentColor: string;
  totalExpenseCents: number;
  children: CategoryTotal[];
}
```

---

## Quick Fixes

```bash
# Force refetch category data
# In browser console:
queryClient.invalidateQueries({ queryKey: ["category-totals"] });

# Check transfer exclusion
# Verify query doesn't include transfers:
console.log("Transfer count:", transactions.filter(t => t.transfer_group_id).length);
// Should be 0 in analytics query

# Verify parent rollup math
const calculatedTotal = group.children.reduce((s, c) => s + c.expenseCents, 0);
console.log({
  parentTotal: group.totalExpenseCents,
  calculatedTotal,
  match: group.totalExpenseCents === calculatedTotal
});

# Test percentage sum
const sum = categories.reduce((s, c) => s + c.percentOfTotal, 0);
console.log("Percentage sum:", sum, "Expected: ~100");
```

---

## Database Query Debugging

```typescript
// Log query details:
console.log("Fetching category totals for:", format(month, "yyyy-MM"));

const { data: transactions, error } = await supabase
  .from("transactions")
  .select("category_id, amount_cents, type, transfer_group_id")
  .is("transfer_group_id", null)
  .gte("date", monthStart)
  .lte("date", monthEnd);

console.log("Transactions found:", transactions?.length);
console.log(
  "Has transfers?:",
  transactions?.some((t) => t.transfer_group_id !== null)
);
// Should be false

if (error) {
  console.error("Query error:", error);
}
```

---

## Common Mistakes Checklist

- [ ] Not excluding transfers (transfer_group_id IS NULL)
- [ ] Parent categories with direct transactions
- [ ] Parent total doesn't sum children
- [ ] Division by zero when no spending
- [ ] Percentages don't sum to ~100%
- [ ] Wrong month boundaries (manual calculation)
- [ ] Not using formatPHP for currency
- [ ] Query key doesn't include month
- [ ] Missing cache invalidation after mutations
- [ ] No loading/empty state handling

---

**Remember**:

1. **Always exclude transfers** from analytics (`WHERE transfer_group_id IS NULL`)
2. **Only child categories** have transactions directly
3. **Parent totals** = sum of all children
4. **Check for zero** before division
5. **Use date-fns** for month calculations

---

**Need more help?** Check:

- DATABASE.md lines 397-438 (Category Totals Query pattern)
- DATABASE.md lines 476-504 (Transfer Exclusion Pattern)
- DECISIONS.md #60 (Transfer design)
