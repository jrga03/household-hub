# Troubleshooting: Basic Dashboard

Common issues with the dashboard and solutions.

---

## Data Loading Issues

### Problem: Dashboard data not loading

**Cause**: Query error or missing permissions

**Solution**:

```typescript
// Check query error in useDashboardData:
const { data, isLoading, error } = useDashboardData(currentMonth);

if (error) {
  console.error("Dashboard query error:", error);
}

// Verify RLS policies allow reading transactions, accounts, categories
// Check Supabase dashboard → Authentication → Policies
```

---

### Problem: Data shows but charts empty

**Cause**: Transfer inclusion or data format mismatch

**Solution**:

```typescript
// Verify transfer exclusion:
const { data: transactions } = await supabase
  .from("transactions")
  .select("...")
  .is("transfer_group_id", null); // ← CRITICAL

// Verify data structure matches chart expectations:
console.log("Monthly trend:", data.monthlyTrend);
console.log("Category breakdown:", data.categoryBreakdown);
```

---

## Transfer Inclusion Issues

### Problem: Income/expense totals too high

**Cause**: Transfers being counted as income/expense

**Solution**:

```typescript
// CORRECT - Exclude transfers everywhere:
const { data: currentTransactions } = await supabase
  .from("transactions")
  .select("amount_cents, type")
  .is("transfer_group_id", null) // ✓ Exclude transfers
  .gte("date", monthStart)
  .lte("date", monthEnd);

// WRONG:
const { data: currentTransactions } = await supabase
  .from("transactions")
  .select("amount_cents, type")
  // ❌ Missing transfer exclusion
  .gte("date", monthStart);
```

**Remember**: All analytics queries must exclude transfers!

---

## Summary Card Issues

### Problem: Comparison percentages wrong

**Cause**: Incorrect percentage calculation or division by zero

**Solution**:

```typescript
// CORRECT - Check for zero:
const incomeChange =
  summary.previousMonthIncomeCents > 0
    ? ((summary.totalIncomeCents - summary.previousMonthIncomeCents) /
        summary.previousMonthIncomeCents) *
      100
    : 0; // ✓ Return 0 if no previous data

// Test cases:
// Current: 12000, Previous: 10000 → +20%
// Current: 8000, Previous: 10000 → -20%
// Current: 10000, Previous: 0 → 0% (avoid division by zero)
```

---

### Problem: Net amount color wrong

**Cause**: Color logic inverted

**Solution**:

```typescript
// CORRECT:
<h3 className={`font-bold ${
  summary.netAmountCents >= 0
    ? "text-green-600"  // ✓ Positive = green
    : "text-red-600"    // ✓ Negative = red
}`}>

// WRONG:
<h3 className={`font-bold ${
  summary.netAmountCents >= 0
    ? "text-red-600"  // ❌ Backwards!
    : "text-green-600"
}`}>
```

---

### Problem: Total balance incorrect

**Cause**: Not including all account transactions or wrong calculation

**Solution**:

```typescript
// Verify calculation includes ALL transactions (including transfers):
const totalBalance = accounts.reduce((sum, account) => {
  const accountTransactions = allTransactions.filter((t) => t.account_id === account.id);

  const balance = accountTransactions.reduce((bal, t) => {
    return bal + (t.type === "income" ? t.amount_cents : -t.amount_cents);
  }, account.initial_balance_cents);

  return sum + balance;
}, 0);

// Note: Balance calculations INCLUDE transfers (unlike analytics)
```

---

## Chart Rendering Issues

### Problem: Recharts not displaying

**Cause**: Missing ResponsiveContainer or incorrect data format

**Solution**:

```typescript
// CORRECT:
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={chartData}>
    {/* chart components */}
  </LineChart>
</ResponsiveContainer>

// WRONG:
<LineChart data={chartData} width={600} height={300}>
  {/* ❌ Not responsive */}
</LineChart>
```

---

### Problem: Chart shows "0" or empty

**Cause**: Data in wrong unit (cents vs pesos)

**Solution**:

```typescript
// For charts, convert cents to pesos for better Y-axis:
const chartData = data.map((d) => ({
  ...d,
  income: d.incomeCents / 100,    // ✓ Convert to pesos
  expense: d.expenseCents / 100,  // ✓ Convert to pesos
}));

// Then use pesos in chart:
<YAxis tickFormatter={(value) => `₱${value.toLocaleString()}`} />
```

---

### Problem: Pie chart slices wrong size

**Cause**: Using wrong data key or calculation error

**Solution**:

```typescript
// Verify data structure:
console.log("Category breakdown:", categoryBreakdown);
// Should have: categoryName, amountCents, percentOfTotal, color

<Pie
  data={categoryBreakdown}
  dataKey="amountCents"  // ✓ Use amount for size
  nameKey="categoryName"
  // ...
/>
```

---

### Problem: Tooltip not showing or wrong data

**Cause**: Custom tooltip component not handling payload correctly

**Solution**:

```typescript
function CustomTooltip({ active, payload }: any) {
  // CRITICAL checks:
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Access data from payload:
  const data = payload[0].payload;  // ← Correct way

  return (
    <div className="bg-card border rounded-lg p-3">
      <p>{data.month}</p>
      <p>{formatPHP(payload[0].value)}</p>
    </div>
  );
}
```

---

## Month Navigation Issues

### Problem: Data doesn't update when changing months

**Cause**: Query key not including month

**Solution**:

```typescript
// CORRECT - Include month in query key:
return useQuery({
  queryKey: ["dashboard", format(currentMonth, "yyyy-MM")],
  queryFn: async () => {
    /* ... */
  },
});

// WRONG:
return useQuery({
  queryKey: ["dashboard"], // ❌ Static key
  queryFn: async () => {
    /* ... */
  },
});
```

---

### Problem: Can navigate to future months

**Cause**: Not disabling next button

**Solution**:

```typescript
// In MonthSelector:
<Button
  onClick={handleNext}
  disabled={
    format(addMonths(selectedMonth, 1), "yyyy-MM") >
    format(new Date(), "yyyy-MM")  // ✓ Disable if future
  }
>
  <ChevronRight />
</Button>
```

---

## Performance Issues

### Problem: Dashboard slow to load

**Cause**: Multiple separate queries instead of single aggregated query

**Solution**:

```typescript
// GOOD - Single query in useDashboardData:
const { data } = useDashboardData(month); // ✓ One query

// BAD - Multiple queries:
const income = useIncome(month); // ❌ Query 1
const expenses = useExpenses(month); // ❌ Query 2
const categories = useCategories(month); // ❌ Query 3
// Too many round trips!
```

---

### Problem: Dashboard re-fetches constantly

**Cause**: staleTime too low

**Solution**:

```typescript
return useQuery({
  queryKey: ["dashboard", monthKey],
  queryFn: fetchDashboard,
  staleTime: 30 * 1000, // ✓ 30 seconds is reasonable
  // staleTime: 0,  // ❌ Refetches on every render
});
```

---

## Recent Transactions Issues

### Problem: Recent transactions not showing

**Cause**: Query not ordering correctly or limit not applied

**Solution**:

```typescript
// CORRECT:
const { data: recentTransactions } = await supabase
  .from("transactions")
  .select(
    `
    *,
    account:accounts(id, name),
    category:categories(id, name, color)
  `
  )
  .order("date", { ascending: false }) // ✓ Most recent first
  .order("created_at", { ascending: false }) // ✓ Tie-breaker
  .limit(10); // ✓ Only 10
```

---

### Problem: "View All" link doesn't work

**Cause**: Wrong Link import or route

**Solution**:

```typescript
// CORRECT - TanStack Router Link:
import { Link } from "@tanstack/react-router";

<Link to="/transactions">
  <Button>View All</Button>
</Link>

// WRONG:
import { Link } from "react-router-dom";  // ❌ Wrong library
```

---

## Empty State Issues

### Problem: Charts break with no data

**Cause**: Not handling empty arrays

**Solution**:

```typescript
// Check for empty data before rendering chart:
if (!data || data.length === 0) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Category Breakdown</h3>
      <div className="text-center py-12 text-muted-foreground">
        No spending data for this month
      </div>
    </Card>
  );
}

return <PieChart data={data} />;  // ✓ Only when data exists
```

---

## Currency Formatting Issues

### Problem: Amounts showing as raw numbers

**Cause**: Not using formatPHP utility

**Solution**:

```typescript
import { formatPHP } from "@/lib/currency";

// CORRECT:
<h3>{formatPHP(summary.totalIncomeCents)}</h3>

// WRONG:
<h3>{summary.totalIncomeCents}</h3>  // Shows "150000" instead of "₱1,500.00"
<h3>₱{(summary.totalIncomeCents / 100).toFixed(2)}</h3>  // Missing thousands separator
```

---

## Real-Time Update Issues

### Problem: Dashboard doesn't update after transaction changes

**Cause**: Cache not invalidating

**Solution**:

```typescript
// After transaction mutation:
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();

// Invalidate dashboard cache:
await queryClient.invalidateQueries({
  queryKey: ["dashboard"],
});
```

---

## Responsive Issues

### Problem: Charts overflow on mobile

**Cause**: Not using ResponsiveContainer

**Solution**:

```typescript
// CORRECT:
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    {/* chart elements */}
  </LineChart>
</ResponsiveContainer>

// Also ensure parent has proper constraints:
<div className="w-full">  {/* ← Full width */}
  <ResponsiveContainer width="100%" height={300}>
    {/* ... */}
  </ResponsiveContainer>
</div>
```

---

### Problem: Summary cards don't stack on mobile

**Cause**: Missing responsive grid classes

**Solution**:

```typescript
// CORRECT:
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  {/* ↑ 1 col mobile, 2 cols tablet, 4 cols desktop */}
  <SummaryCard />
  <SummaryCard />
  <SummaryCard />
  <SummaryCard />
</div>
```

---

## Type Issues

### Problem: TypeScript errors on chart props

**Cause**: Recharts type definitions or custom tooltip

**Solution**:

```typescript
// For custom tooltips, use `any` type (Recharts types are complex):
function CustomTooltip({ active, payload }: any) {
  // Use type guards:
  if (!active || !payload || !payload.length) {
    return null;
  }
  // ...
}

// Or import Recharts types:
import { TooltipProps } from "recharts";
```

---

## Quick Fixes

```bash
# Force refetch dashboard data
# In browser console:
queryClient.invalidateQueries({ queryKey: ["dashboard"] });

# Verify transfer exclusion
# Check query in network tab for:
# "transfer_group_id.is.null"

# Test chart data structure
console.log("Monthly trend:", data.monthlyTrend);
console.log("Expected: array of { month, incomeCents, expenseCents }");

# Verify summary calculations
const manualIncome = transactions
  .filter(t => t.type === "income")
  .reduce((sum, t) => sum + t.amount_cents, 0);
console.log("Manual income:", manualIncome);
console.log("Query income:", summary.totalIncomeCents);
console.log("Match:", manualIncome === summary.totalIncomeCents);
```

---

## Common Mistakes Checklist

- [ ] Not excluding transfers from analytics
- [ ] Division by zero in percentage calculations
- [ ] Wrong data unit (cents vs pesos) in charts
- [ ] Not using ResponsiveContainer for charts
- [ ] Query key doesn't include month
- [ ] Not handling empty data arrays
- [ ] Wrong import (react-router-dom vs @tanstack/react-router)
- [ ] Not using formatPHP for currency
- [ ] Missing cache invalidation after mutations
- [ ] Charts not responsive on mobile

---

**Remember**:

1. **Always exclude transfers** from analytics (`WHERE transfer_group_id IS NULL`)
2. **Include transfers** in account balance calculations
3. **Convert cents to pesos** for chart Y-axis display
4. **Use ResponsiveContainer** for all Recharts components
5. **Check for zero** before division (percentage calculations)

---

**Need more help?** Check:

- DATABASE.md lines 440-474 (Monthly Summary Query)
- IMPLEMENTATION-PLAN.md Day 14 (Dashboard requirements)
- Recharts documentation: https://recharts.org/
