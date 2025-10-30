# Troubleshooting: Analytics Dashboard

---

## Chart Rendering Issues

### Problem: Charts not rendering (blank space)

**Symptoms**: White/blank space where charts should be, no errors in console

**Causes & Solutions**:

1. **Missing ResponsiveContainer height**

   ```typescript
   // ❌ Bad - no parent height
   <ResponsiveContainer width="100%" height={300}>
     <LineChart data={data}>...</LineChart>
   </ResponsiveContainer>

   // ✅ Good - parent has explicit height
   <div style={{ height: 400 }}>
     <ResponsiveContainer width="100%" height="100%">
       <LineChart data={data}>...</LineChart>
     </ResponsiveContainer>
   </div>

   // ✅ Better - using Tailwind
   <div className="h-[300px]">
     <ResponsiveContainer width="100%" height="100%">
       <LineChart data={data}>...</LineChart>
     </ResponsiveContainer>
   </div>
   ```

2. **Data not loaded yet**

   ```typescript
   // ❌ Bad - renders before data loads
   <SpendingTrendChart data={data.monthlyTrend} />

   // ✅ Good - check if data exists
   {data?.monthlyTrend && data.monthlyTrend.length > 0 && (
     <SpendingTrendChart data={data.monthlyTrend} />
   )}

   // ✅ Better - with fallback
   {data?.monthlyTrend && data.monthlyTrend.length > 0 ? (
     <SpendingTrendChart data={data.monthlyTrend} />
   ) : (
     <div className="text-sm text-muted-foreground">No data available</div>
   )}
   ```

3. **Recharts not imported correctly**

   ```bash
   # Verify Recharts installed
   npm list recharts

   # If missing, install
   npm install recharts
   ```

4. **Wrong data format**

   ```typescript
   // Debug data structure
   console.log("Chart data:", data?.monthlyTrend);

   // ✅ Expected format for line chart:
   // [
   //   { month: "Jan 2025", income: 50000, expenses: 30000 },
   //   { month: "Feb 2025", income: 55000, expenses: 32000 },
   // ]

   // ❌ Wrong - data is undefined or null
   // ❌ Wrong - data is an object instead of array
   // ❌ Wrong - missing required keys (month, income, expenses)
   ```

---

### Problem: "Cannot read property 'map' of undefined"

**Cause**: Data hasn't loaded or query failed

**Solution**:

```typescript
// In useAnalytics hook
export function useAnalytics(startDate: Date, endDate: Date, filters?: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics", format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"), filters],
    queryFn: async (): Promise<AnalyticsData> => {
      const { data: transactionData, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch analytics: ${error.message}`);
      }

      // ✅ Always return arrays, even if empty
      return {
        monthlyTrend: processMonthlyTrend(transactionData || []), // Not null!
        categoryBreakdown: processCategoryBreakdown(transactionData || []),
        // ... other fields
      };
    },
  });
}

// In component
const { data, isLoading, error } = useAnalytics(startDate, endDate);

// ✅ Handle all states
if (isLoading) return <div>Loading...</div>;
if (error) return <div>Error: {error.message}</div>;
if (!data) return null; // Safety check

// Now safe to use data
return <SpendingTrendChart data={data.monthlyTrend} />;
```

---

### Problem: Charts flash or disappear on re-render

**Cause**: Key prop not set or changing unnecessarily

**Solution**:

```typescript
// ❌ Bad - key changes on every render
<SpendingTrendChart key={Math.random()} data={data} />

// ✅ Good - stable key
<SpendingTrendChart key="spending-trend" data={data} />

// ✅ Better - memoize component
const MemoizedChart = memo(SpendingTrendChart);
<MemoizedChart data={data.monthlyTrend} />
```

---

## Data Issues

### Problem: Transfers appearing in analytics totals

**Symptoms**: Totals don't match manual calculations, numbers seem inflated

**Cause**: Missing `transfer_group_id IS NULL` filter

**Solution**:

```typescript
// ❌ WRONG - includes transfers
const { data } = await supabase
  .from("transactions")
  .select("amount_cents, type")
  .gte("date", startDate)
  .lte("date", endDate);
// This will include transfer transactions!

// ✅ CORRECT - excludes transfers
const { data } = await supabase
  .from("transactions")
  .select("amount_cents, type")
  .gte("date", startDate)
  .lte("date", endDate)
  .is("transfer_group_id", null); // CRITICAL!

// Verify transfer exclusion works:
console.log("Total with transfers:", dataWithTransfers.length);
console.log("Total without transfers:", dataWithoutTransfers.length);
// Difference should equal number of transfer transactions
```

**Verification query**:

```sql
-- Run in Supabase SQL editor
-- Count transfer transactions
SELECT COUNT(*) as transfer_count
FROM transactions
WHERE transfer_group_id IS NOT NULL
  AND date >= '2025-10-01'
  AND date <= '2025-10-31';

-- If count > 0, transfers exist and MUST be excluded from analytics
```

---

### Problem: Budget variance calculations wrong

**Symptoms**: Budget progress shows incorrect percentages, variance doesn't match

**Causes & Solutions**:

1. **Transfers included in actual spending**

   ```typescript
   // ❌ WRONG
   const actualSpend = await supabase
     .from("transactions")
     .select("amount_cents")
     .eq("category_id", categoryId)
     .eq("type", "expense")
     .gte("date", monthStart)
     .lte("date", monthEnd);
   // Missing: .is('transfer_group_id', null)

   // ✅ CORRECT
   const actualSpend = await supabase
     .from("transactions")
     .select("amount_cents")
     .eq("category_id", categoryId)
     .eq("type", "expense")
     .is("transfer_group_id", null) // Add this!
     .gte("date", monthStart)
     .lte("date", monthEnd);
   ```

2. **Wrong month range**

   ```typescript
   // ❌ Wrong - comparing budget for Oct with spending from Nov
   const budgetMonth = "2025-10-01";
   const spendingStart = "2025-11-01"; // Different month!

   // ✅ Correct - same month for both
   const budgetMonth = "2025-10-01";
   const spendingStart = "2025-10-01";
   const spendingEnd = "2025-10-31";
   ```

3. **Calculation error**

   ```typescript
   // ❌ Wrong calculation
   const percentUsed = (budget / actual) * 100; // Backwards!

   // ✅ Correct
   const percentUsed = (actual / budget) * 100;

   // Verify:
   // Budget: ₱10,000 (1000000 cents)
   // Actual: ₱5,000 (500000 cents)
   // Expected: 50%
   // Formula: (500000 / 1000000) * 100 = 50%
   ```

---

### Problem: Year-over-year shows incorrect comparison

**Symptoms**: YoY percentage doesn't match manual calculation

**Solutions**:

```typescript
// Common mistake: Not subtracting exactly 1 year
// ❌ Wrong
const prevYear = new Date(currentDate);
prevYear.setMonth(prevYear.getMonth() - 12); // Can cause issues

// ✅ Correct - use date-fns
import { subYears } from "date-fns";
const prevYear = subYears(currentDate, 1);

// Verify dates align:
console.log("Current range:", startDate, endDate);
console.log("Previous range:", prevYearStart, prevYearEnd);
// Should be exactly 365/366 days apart
```

---

### Problem: Wrong currency amounts displayed

**Symptoms**: Amounts show as cents instead of pesos, or missing decimals

**Causes & Solutions**:

1. **Not dividing by 100**

   ```typescript
   // ❌ Wrong - shows 150050 instead of ₱1,500.50
   <span>{amount_cents}</span>

   // ✅ Correct
   import { formatPHP } from '@/lib/currency';
   <span>{formatPHP(amount_cents)}</span>
   ```

2. **Dividing by 100 twice**

   ```typescript
   // ❌ Wrong - shows ₱15.00 instead of ₱1,500.50
   const pesos = amount_cents / 100;
   <span>{formatPHP(pesos)}</span> // formatPHP also divides by 100!

   // ✅ Correct
   <span>{formatPHP(amount_cents)}</span>
   ```

3. **Recharts displaying wrong scale**

   ```typescript
   // For Recharts, data should be in pesos (not cents)
   const chartData = monthlyTrend.map(d => ({
     month: d.month,
     income: d.income / 100, // Convert cents to pesos
     expenses: d.expenses / 100,
   }));

   // Then in tooltip
   <Tooltip
     formatter={(value: number) => formatPHP(value * 100)} // Convert back to cents for formatting
   />
   ```

---

## Performance Issues

### Problem: Analytics page loads slowly (>2 seconds)

**Symptoms**: White screen, delayed chart rendering, browser lag

**Solutions**:

1. **Too much data being fetched**

   ```typescript
   // ❌ Fetching all transaction fields
   const { data } = await supabase.from("transactions").select("*").gte("date", veryOldDate); // Years of data!

   // ✅ Only fetch needed fields
   const { data } = await supabase
     .from("transactions")
     .select("date, type, amount_cents, category_id, categories(name)")
     .gte("date", recentDate) // Limit to 6-12 months
     .lte("date", endDate);
   ```

2. **Not using TanStack Query cache**

   ```typescript
   // ✅ Set appropriate staleTime
   useQuery({
     queryKey: ["analytics", startDate, endDate, filters],
     queryFn: fetchAnalytics,
     staleTime: 5 * 60 * 1000, // 5 minutes - don't re-fetch unnecessarily
   });
   ```

3. **Re-calculating on every render**

   ```typescript
   // ❌ Expensive calculation in render
   function AnalyticsDashboard() {
     const data = useAnalytics(...);
     const processedData = expensiveCalculation(data); // Runs every render!
   }

   // ✅ Memoize expensive calculations
   import { useMemo } from 'react';

   function AnalyticsDashboard() {
     const data = useAnalytics(...);
     const processedData = useMemo(
       () => expensiveCalculation(data),
       [data] // Only recalculate when data changes
     );
   }
   ```

4. **Charts not lazy-loaded**

   ```typescript
   // ✅ Lazy load chart components
   import { lazy, Suspense } from 'react';
   import { Skeleton } from '@/components/ui/skeleton';

   const SpendingTrendChart = lazy(() =>
     import('@/components/charts/SpendingTrendChart')
       .then(m => ({ default: m.SpendingTrendChart }))
   );

   // In component
   <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
     <SpendingTrendChart data={data.monthlyTrend} />
   </Suspense>
   ```

---

### Problem: Charts cause browser to freeze with large datasets

**Symptoms**: Page becomes unresponsive when viewing analytics with 10k+ transactions

**Solutions**:

1. **Limit data points in charts**

   ```typescript
   // Limit monthly trend to 12 months max
   const limitedTrend = monthlyTrend.slice(-12);

   // Limit category breakdown to top 10
   const topCategories = categoryBreakdown.sort((a, b) => b.value - a.value).slice(0, 10);
   ```

2. **Aggregate data before charting**

   ```typescript
   // Instead of plotting every transaction, group by month
   function aggregateByMonth(transactions) {
     return transactions.reduce((acc, t) => {
       const month = format(new Date(t.date), "MMM yyyy");
       if (!acc[month]) {
         acc[month] = { income: 0, expenses: 0 };
       }
       acc[month][t.type === "income" ? "income" : "expenses"] += t.amount_cents;
       return acc;
     }, {});
   }
   ```

3. **Use React.memo for charts**

   ```typescript
   import { memo } from "react";

   export const SpendingTrendChart = memo(
     function SpendingTrendChart({ data }) {
       // Chart component
     },
     (prevProps, nextProps) => {
       // Only re-render if data actually changed
       return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
     }
   );
   ```

---

## Filter Issues

### Problem: Filters not updating charts

**Symptoms**: Changing filters doesn't update displayed data

**Solutions**:

1. **Filters not in queryKey**

   ```typescript
   // ❌ Missing filters in queryKey
   useQuery({
     queryKey: ["analytics", startDate, endDate], // Filters missing!
     queryFn: () => fetchAnalytics(startDate, endDate, filters),
   });

   // ✅ Include filters in queryKey
   useQuery({
     queryKey: ["analytics", startDate, endDate, filters], // Now filters trigger refetch
     queryFn: () => fetchAnalytics(startDate, endDate, filters),
   });
   ```

2. **State not updating**

   ```typescript
   // ❌ No state setter
   const [dateRange] = useState(initialRange); // Can't change!

   // ✅ With setter
   const [dateRange, setDateRange] = useState(initialRange);

   // In FilterPanel
   <Button onClick={() => onFilterChange(newFilters)}>
     Apply Filters
   </Button>
   ```

3. **Filters not applied in queries**

   ```typescript
   // ❌ Filters ignored
   export function useAnalytics(start, end, filters) {
     let query = supabase.from("transactions").select("*");
     // Not using filters param!
   }

   // ✅ Apply filters
   export function useAnalytics(start, end, filters) {
     let query = supabase.from("transactions").select("*");
     if (filters?.accountId) {
       query = query.eq("account_id", filters.accountId);
     }
     if (filters?.categoryId) {
       query = query.eq("category_id", filters.categoryId);
     }
     // etc.
   }
   ```

---

## TypeScript Errors

### Problem: Type 'any' errors with Recharts

**Symptoms**: TypeScript complains about Recharts props

**Solutions**:

```typescript
// Install Recharts types
npm install --save-dev @types/recharts

// ✅ Proper typing for chart data
interface MonthlyTrendData {
  month: string;
  income: number;
  expenses: number;
}

interface ChartProps {
  data: MonthlyTrendData[];
}

export function SpendingTrendChart({ data }: ChartProps) {
  return (
    <LineChart data={data}>
      {/* ... */}
    </LineChart>
  );
}

// ✅ Type tooltip formatter
<Tooltip
  formatter={(value: number, name: string) => [
    formatPHP(value * 100),
    name === 'income' ? 'Income' : 'Expenses'
  ]}
/>
```

---

### Problem: Property 'categories' does not exist on type 'Transaction'

**Solution**: Add to Transaction interface

```typescript
interface Transaction {
  id: string;
  date: string;
  type: "income" | "expense";
  amount_cents: number;
  category_id: string;
  account_id: string;
  description: string;
  categories?: { name: string }; // Add this for joined data
}
```

---

## Date/Time Issues

### Problem: Date picker shows wrong dates or timezone issues

**Solutions**:

1. **Use date-fns consistently**

   ```typescript
   import { format, startOfMonth, endOfMonth } from "date-fns";

   // ✅ Consistent date formatting
   const startDate = startOfMonth(new Date());
   const formattedStart = format(startDate, "yyyy-MM-dd");
   ```

2. **Store dates as DATE not TIMESTAMP**

   ```sql
   -- ✅ Transaction date field is DATE type (no timezone)
   CREATE TABLE transactions (
     date DATE NOT NULL, -- User's local date
     created_at TIMESTAMPTZ DEFAULT NOW() -- Server timestamp
   );
   ```

---

## Offline Behavior Issues

### Problem: Analytics doesn't work offline

**Cause**: Only queries Supabase, no Dexie fallback

**Solution** (advanced):

```typescript
export function useAnalytics(startDate, endDate, filters) {
  const isOnline = useOnlineStatus(); // Custom hook

  return useQuery({
    queryKey: ["analytics", startDate, endDate, filters, isOnline],
    queryFn: async () => {
      if (isOnline) {
        // Fetch from Supabase
        return fetchFromSupabase();
      } else {
        // Fallback to Dexie
        return fetchFromDexie();
      }
    },
  });
}

async function fetchFromDexie() {
  const transactions = await db.transactions
    .where("date")
    .between(startDate, endDate)
    .and((t) => t.transfer_group_id === null) // Exclude transfers
    .toArray();

  return processTransactions(transactions);
}
```

---

## Quick Fixes

### Reset everything

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

---

### Verify Recharts installation

```bash
npm list recharts
# Should show: recharts@2.x.x

# If not installed
npm install recharts

# Check imports work
node -e "require('recharts')" && echo "✅ Recharts OK" || echo "❌ Recharts broken"
```

---

### Debug analytics query

```typescript
// Add logging to useAnalytics hook
export function useAnalytics(startDate, endDate, filters) {
  return useQuery({
    queryKey: [
      "analytics",
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
      filters,
    ],
    queryFn: async () => {
      console.log("Fetching analytics:", { startDate, endDate, filters });

      const { data, error } = await query;

      console.log("Query result:", { data: data?.length, error });

      if (error) throw error;

      const processed = {
        monthlyTrend: processMonthlyTrend(data || []),
        categoryBreakdown: processCategoryBreakdown(data || []),
        // ...
      };

      console.log("Processed analytics:", processed);

      return processed;
    },
  });
}
```

---

## Still Having Issues?

### Check verification.md

Run through `verification.md` step-by-step to identify exactly where things break.

### Check implementation-plan reference

Compare your implementation with the original spec in:

- `docs/initial plan/IMPLEMENTATION-PLAN.md` (lines 490-522)
- `docs/initial plan/DATABASE.md` (transfer exclusion pattern)

### Common overlooked issues:

- [ ] Chunk 013 not completed (Recharts not installed)
- [ ] formatPHP function missing or wrong (chunk 006)
- [ ] Supabase connection not configured
- [ ] RLS policies blocking queries
- [ ] Budget data missing from database (chunk 014)
- [ ] Transfer_group_id column missing

### Debug checklist:

```bash
# 1. Check file structure
ls -la src/hooks/useAnalytics.ts
ls -la src/components/analytics/
ls -la src/components/charts/

# 2. Check dependencies
npm list recharts date-fns

# 3. Check TypeScript
npm run type-check

# 4. Check Supabase connection
# In browser console:
import { supabase } from '@/lib/supabase';
const { data, error } = await supabase.from('transactions').select('count');
console.log({ count: data, error });

# 5. Check for console errors
# Open DevTools → Console
# Look for red errors

# 6. Check network requests
# DevTools → Network
# Filter: Fetch/XHR
# Look for failed requests (red)
```

---

**If issue persists**: Check `verification.md` for comprehensive testing, or review chunk 013 prerequisites.
