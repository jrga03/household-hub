# Verification: Analytics Dashboard

This guide helps you verify that chunk 044 was implemented correctly.

---

## Prerequisites Verification

Run these checks **BEFORE** starting implementation to ensure dependencies are met.

### From Chunk 013 (Basic Dashboard)

**Critical**: Chunk 044 **extends** chunk 013's basic dashboard with advanced analytics features.

```bash
# 1. Verify Recharts installed (from chunk 013)
grep -q "\"recharts\"" package.json && echo "✅ Recharts installed" || echo "❌ Missing recharts"

# 2. Check basic dashboard exists
test -f src/components/dashboard/MonthlyChart.tsx && echo "✅ Basic charts from chunk 013" || echo "⚠️ Chunk 013 may not be complete"

# 3. Verify dashboard route
test -f src/routes/index.tsx && echo "✅ Dashboard route exists" || echo "❌ Missing dashboard route"
```

**Expected**: All ✅ (chunk 013 should be complete before starting chunk 044)

### From Chunk 006 (Currency System)

```bash
# Verify currency utilities exist
cat src/lib/currency.ts | grep "export function formatPHP"
```

**Expected**: Function signature visible

### From Chunk 010 (Transactions)

```bash
# Check transaction queries work
cat src/lib/supabaseQueries.ts | grep "useTransactions"
# OR
cat src/hooks/useTransactions.ts | grep "export"
```

**Expected**: Transaction query hook exists

### From Chunk 014 (Budgets)

```bash
# Check budgets table queried (needed for budget variance)
grep -r "budgets" src/lib/ src/hooks/ | head -5
```

**Expected**: Budget queries exist (for variance analysis)

---

## Test Data Setup

Before testing analytics, ensure you have sufficient sample data:

```typescript
// In browser console - verify data exists
import { supabase } from "@/lib/supabase";

// Check transaction count
const { count: txCount } = await supabase.from("transactions").select("*", { count: "only" });
console.log(`Transactions: ${txCount}`);
// ✅ Expected: At least 20+ transactions across 3+ months

// Check budget data
const { count: budgetCount } = await supabase.from("budgets").select("*", { count: "only" });
console.log(`Budgets: ${budgetCount}`);
// ✅ Expected: At least 3+ budgets for current month

// Verify transfers exist (to test exclusion)
const { count: transferCount } = await supabase
  .from("transactions")
  .select("*", { count: "only" })
  .not("transfer_group_id", "is", null);
console.log(`Transfers: ${transferCount}`);
// ✅ Expected: At least 2+ transfers (to verify exclusion)
```

**Create test data if needed:**

```sql
-- Run in Supabase SQL editor
-- This creates diverse test data for analytics

-- Create transactions across 6 months
INSERT INTO transactions (id, date, type, description, amount_cents, account_id, category_id, status, created_at, created_by_user_id, household_id)
SELECT
  gen_random_uuid(),
  date_trunc('month', CURRENT_DATE) - (interval '1 month' * months) + (interval '1 day' * days),
  CASE WHEN random() > 0.4 THEN 'expense' ELSE 'income' END,
  'Test transaction ' || months || '-' || days,
  floor(random() * 100000)::int, -- Random amount 0-1000 PHP
  (SELECT id FROM accounts LIMIT 1), -- Your first account
  (SELECT id FROM categories WHERE parent_id IS NOT NULL ORDER BY random() LIMIT 1),
  CASE WHEN random() > 0.2 THEN 'cleared' ELSE 'pending' END,
  now(),
  auth.uid(),
  (SELECT id FROM profiles LIMIT 1)
FROM generate_series(0, 5) months,
     generate_series(1, 10) days;
```

---

## Post-Implementation Verification

After completing all instructions, verify each component:

### 1. Analytics Hook Enhanced ✓

```bash
# Check file exists
ls -la src/hooks/useAnalytics.ts
```

**Expected**: File exists with ~200+ lines

**Verify hook signature:**

```typescript
// In browser console or by reading file
import { useAnalytics } from '@/hooks/useAnalytics';

// Should accept these parameters:
useAnalytics(
  startDate: Date,
  endDate: Date,
  filters?: {
    accountId?: string;
    categoryId?: string;
    type?: 'income' | 'expense';
  }
);
```

**Test hook returns complete data:**

```typescript
// In component or console
const { data, isLoading, error } = useAnalytics(new Date("2025-01-01"), new Date("2025-12-31"));

console.log(data);
// ✅ Expected structure:
// {
//   monthlyTrend: Array<{ month, income, expenses }>,
//   categoryBreakdown: Array<{ name, value }>,
//   totalIncome: number,
//   totalExpenses: number,
//   budgetVariance: Array<{ category, budget, actual, variance, percentUsed }>,
//   yearOverYear: { currentYear, previousYear, change, percentChange },
//   insights: {
//     avgMonthlySpending: number,
//     largestTransactions: Array<Transaction>,
//     topCategories: Array<{ name, amount }>,
//   }
// }
```

---

### 2. Charts Render Correctly ✓

Visit `/analytics` route:

**Check all charts display:**

- [ ] Spending Trend Chart (line chart with 6 months data)
- [ ] Category Pie Chart (top 10 categories)
- [ ] Income vs Expense Bar Chart (monthly comparison)
- [ ] Budget Progress Bars (for each budget with variance)

**Verify chart interactivity:**

- [ ] Hover shows tooltips with formatted PHP amounts
- [ ] Tooltips display correctly (no "NaN" or "undefined")
- [ ] Legend items clickable (toggle data series)
- [ ] Charts responsive (resize browser window)
- [ ] Mobile view works (test at 375px width)

---

### 3. Transfer Exclusion Working ✓

**Critical security test** - transfers MUST NOT appear in analytics.

```typescript
// In browser console
import { supabase } from '@/lib/supabase';

// Get analytics total for current month
const analyticsExpense = /* value shown in analytics dashboard */;

// Manual query WITH transfer exclusion
const { data: correctData } = await supabase
  .from('transactions')
  .select('amount_cents')
  .eq('type', 'expense')
  .is('transfer_group_id', null) // Exclude transfers
  .gte('date', '2025-10-01')
  .lte('date', '2025-10-31');

const correctTotal = correctData.reduce((sum, t) => sum + t.amount_cents, 0) / 100;

// Manual query WITHOUT transfer exclusion (WRONG)
const { data: wrongData } = await supabase
  .from('transactions')
  .select('amount_cents')
  .eq('type', 'expense')
  .gte('date', '2025-10-01')
  .lte('date', '2025-10-31');

const wrongTotal = wrongData.reduce((sum, t) => sum + t.amount_cents, 0) / 100;

console.log('Analytics shows:', analyticsExpense);
console.log('Correct (no transfers):', correctTotal);
console.log('Wrong (with transfers):', wrongTotal);

// ✅ Expected: analyticsExpense === correctTotal
// ❌ Failure: analyticsExpense === wrongTotal (means transfers included!)
```

**If transfers are included, check:**

```bash
# Verify all queries have transfer exclusion
grep -n "transfer_group_id" src/hooks/useAnalytics.ts
```

**Expected**: Every query should have `.is('transfer_group_id', null)`

---

### 4. Budget Variance Calculation ✓

**Test budget vs actual displays correctly:**

```typescript
// In browser console - verify budget variance logic
import { supabase } from "@/lib/supabase";

const month = "2025-10-01"; // First day of month

// Get budget for a category
const { data: budgets } = await supabase
  .from("budgets")
  .select("category_id, amount_cents")
  .eq("month", month);

const budget = budgets[0]; // Pick first budget

// Get actual spending for that category
const { data: transactions } = await supabase
  .from("transactions")
  .select("amount_cents")
  .eq("category_id", budget.category_id)
  .is("transfer_group_id", null) // CRITICAL!
  .gte("date", "2025-10-01")
  .lte("date", "2025-10-31");

const actualSpend = transactions.reduce((sum, t) => sum + t.amount_cents, 0);
const variance = budget.amount_cents - actualSpend;
const percentUsed = (actualSpend / budget.amount_cents) * 100;

console.log({
  budget: budget.amount_cents / 100,
  actual: actualSpend / 100,
  variance: variance / 100,
  percentUsed: percentUsed.toFixed(1) + "%",
});

// ✅ Compare with what analytics dashboard shows
// Should match exactly
```

---

### 5. Filters Work ✓

**Test all filter parameters:**

```typescript
// Test account filter
const { data: accountFiltered } = useAnalytics(startDate, endDate, {
  accountId: "some-account-id",
});
// ✅ Verify: Only transactions from that account included

// Test category filter
const { data: categoryFiltered } = useAnalytics(startDate, endDate, {
  categoryId: "some-category-id",
});
// ✅ Verify: Only transactions in that category

// Test type filter
const { data: expenseOnly } = useAnalytics(startDate, endDate, {
  type: "expense",
});
// ✅ Verify: categoryBreakdown only shows expenses
```

**UI Filter Testing:**

Visit `/analytics` and test:

- [ ] Date range picker changes data
- [ ] Account dropdown filters correctly
- [ ] Category dropdown filters correctly
- [ ] Type toggle (income/expense/both) works
- [ ] Clear filters button resets all

---

### 6. Year-over-Year Comparison ✓

**Verify YoY logic:**

```typescript
// Check year-over-year data structure
const { data } = useAnalytics(new Date("2025-01-01"), new Date("2025-12-31"));

console.log(data.yearOverYear);
// ✅ Expected:
// {
//   currentYear: { income, expenses },
//   previousYear: { income, expenses },
//   change: { income, expenses },
//   percentChange: { income, expenses }
// }

// Verify calculation
const currentSpending = 15000; // Example current year
const previousSpending = 12000; // Example previous year
const expectedChange = currentSpending - previousSpending; // 3000
const expectedPercent = ((currentSpending - previousSpending) / previousSpending) * 100; // 25%

// ✅ Dashboard should show: "+25% vs last year"
```

---

### 7. Performance Metrics ✓

**Load Time Test:**

```javascript
// In browser DevTools console
performance.mark("analytics-start");

// Navigate to /analytics
// Wait for page to fully load

performance.mark("analytics-end");
performance.measure("analytics-load", "analytics-start", "analytics-end");

const loadTime = performance.getEntriesByName("analytics-load")[0].duration;
console.log(`Analytics load time: ${loadTime.toFixed(0)}ms`);

// ✅ Expected: <1000ms with 1000 transactions
// ⚠️ Acceptable: <2000ms with 5000+ transactions
// ❌ Failure: >2000ms (needs optimization)
```

**Chart Render Performance:**

```javascript
// Test Recharts render time
const start = performance.now();

// Trigger chart re-render (change date range)
// Wait for chart to update

const end = performance.now();
console.log(`Chart render: ${(end - start).toFixed(0)}ms`);

// ✅ Expected: <200ms per chart
// ❌ Failure: >500ms (consider data limiting)
```

**Bundle Size Check:**

```bash
# After build
npm run build

# Check analytics chunk size
ls -lh dist/assets/*.js | grep -i chart
```

**Expected**: Recharts chunk ~80-100KB (acceptable per PERFORMANCE-BUDGET.md)

---

### 8. Accessibility Verification ✓

**Keyboard Navigation:**

```
Tab through analytics page:
1. Press Tab → Focus on date range picker
2. Press Tab → Focus on account filter
3. Press Tab → Focus on category filter
4. Press Enter → Open dropdown
5. Arrow keys → Navigate options
6. Tab to charts → Should have focus indicators
```

**Expected**: All interactive elements reachable via keyboard

**Screen Reader Test:**

```bash
# Install axe DevTools browser extension
# Visit /analytics
# Run axe audit
```

**Check for:**

- [ ] All charts have `aria-label` describing content
- [ ] Summary cards have proper heading hierarchy (h2, h3)
- [ ] Tooltips have `role="tooltip"` and `aria-describedby`
- [ ] Color contrast passes WCAG AA (4.5:1 for text)
- [ ] No axe violations reported

**Manual screen reader test** (if available):

- [ ] VoiceOver (Mac): Announces "Spending trend chart showing income and expenses over 6 months"
- [ ] Summary cards read values correctly
- [ ] Filters announce state changes

---

### 9. Offline Behavior ✓

**Test offline analytics:**

1. Load `/analytics` while online
2. DevTools → Network → Offline
3. Refresh page
4. **Expected**: Analytics loads from cache
5. **Expected**: "Last updated" timestamp shows
6. **Expected**: Message: "Viewing cached data. Connect to refresh."

**Test data staleness:**

```typescript
// Check analytics uses Dexie fallback when offline
import { db } from "@/lib/dexie";

// Offline query should read from IndexedDB
const offlineTransactions = await db.transactions.toArray();
// ✅ Analytics should match this data when offline
```

---

### 10. TypeScript Type Safety ✓

```bash
# Run type checker
npm run type-check
```

**Expected**: No errors in:

- `src/hooks/useAnalytics.ts`
- `src/components/charts/*.tsx`
- `src/components/Dashboard.tsx`

**Common type issues to check:**

```typescript
// ✅ Good - fully typed
function processMonthlyTrend(data: Transaction[]): MonthlyTrendData[] {}

// ❌ Bad - any types
function processMonthlyTrend(data: any): any {}

// ✅ Good - Recharts types
import { LineChart, LineChartProps } from "recharts";

// ❌ Bad - missing types
const SpendingTrendChart = ({ data }: any) => {};
```

---

## Integration Verification

### 11. Navigation Integration ✓

**Verify navigation link exists:**

```bash
# Check navigation component has analytics link
grep -r "to=\"/analytics\"" src/components/ src/layouts/
```

**Expected**: Navigation component includes analytics link

**Test navigation:**

1. Click "Dashboard" → See basic dashboard (chunk 013)
2. Click "Analytics" → See advanced analytics (chunk 044)
3. Verify both routes work
4. Check URL updates correctly

---

### 12. Data Consistency ✓

**Compare analytics with dashboard:**

```
Open two browser windows:
Window 1: / (basic dashboard from chunk 013)
Window 2: /analytics (advanced analytics from chunk 044)

Compare totals:
- Total income should match
- Total expenses should match
- Account balances should match
- Category totals should match
```

**If mismatch found:**

```typescript
// Debug query differences
// Check if one includes transfers and other doesn't
// Check date range differences
// Check filter differences
```

---

## Cross-Browser Testing

### 13. Chrome/Edge ✓

- [ ] Charts render correctly
- [ ] Tooltips work on hover
- [ ] Filters functional
- [ ] Performance <1s load
- [ ] No console errors

### 14. Firefox ✓

- [ ] Charts render correctly
- [ ] Recharts compatibility
- [ ] Date picker works
- [ ] All features functional

### 15. Safari (Desktop) ✓

- [ ] Charts render
- [ ] Date picker compatible
- [ ] Filters work
- [ ] No layout issues

### 16. iOS Safari ✓

**Critical for this project (offline-first mobile app):**

- [ ] Charts responsive on mobile (375px)
- [ ] Tooltips work on tap (not hover)
- [ ] Filters accessible on small screen
- [ ] Performance acceptable on mobile
- [ ] Works in standalone mode (PWA)
- [ ] Offline analytics functional

---

## Security & Privacy

### 17. No Sensitive Data Exposure ✓

```typescript
// Verify analytics doesn't expose sensitive fields
// Check network tab when loading /analytics

// ✅ Safe to show: Aggregated totals, category names, date ranges
// ❌ Never expose: Individual transaction descriptions, notes, tagged_user_ids
```

**Privacy check:**

- [ ] Individual transaction details not shown (only aggregates)
- [ ] Budget variance shown per category (not user-specific)
- [ ] No PII in chart labels or tooltips

---

## Final Checklist

Run through all checks before marking chunk complete:

### Code Quality

- [ ] `npm run lint` passes
- [ ] `npm run type-check` passes
- [ ] No console errors on /analytics
- [ ] All TypeScript types defined (no `any`)

### Functionality

- [ ] All charts render without errors
- [ ] Transfers excluded from all analytics
- [ ] Budget variance calculates correctly
- [ ] Year-over-year comparison works
- [ ] All filters functional
- [ ] Date range picker works

### Data Integrity

- [ ] Analytics totals match manual SQL queries
- [ ] Transfer exclusion verified
- [ ] Budget variance matches manual calculation
- [ ] No data loss or duplication

### Performance

- [ ] Load time <1s with 1000 transactions
- [ ] Chart render <200ms
- [ ] Recharts bundle size acceptable
- [ ] No memory leaks on re-renders

### Accessibility

- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] ARIA labels on charts
- [ ] Color contrast passes WCAG AA
- [ ] No axe violations

### Responsiveness

- [ ] Works on desktop (1920px)
- [ ] Works on tablet (768px)
- [ ] Works on mobile (375px)
- [ ] Charts resize smoothly

### Cross-Browser

- [ ] Chrome/Edge tested
- [ ] Firefox tested
- [ ] Safari tested
- [ ] iOS Safari tested (critical)

### Offline Support

- [ ] Analytics loads offline
- [ ] Cached data displayed
- [ ] Staleness indicator shown
- [ ] Dexie fallback works

---

## Success Criteria

**Minimum passing grade (must have ALL):**

✅ All charts render correctly with accurate data
✅ Transfers excluded from all analytics (verified via SQL)
✅ Budget variance calculates and displays correctly
✅ Filters work (account, category, type, date range)
✅ Performance <1s load with 1000 transactions
✅ Accessibility passes (keyboard nav + screen reader)
✅ Works on iOS Safari (critical for this project)
✅ No TypeScript errors or console warnings

**Excellent implementation (bonus):**

✅ Year-over-year comparison working
✅ Insights section with trends and recommendations
✅ Lazy loading charts (performance optimization)
✅ Real-time updates when transactions change
✅ Export analytics to CSV/PDF
✅ Custom date range presets (This Month, Last Quarter, etc.)

---

## Troubleshooting

If any verification fails, see `troubleshooting.md` for solutions.

Common issues:

- Charts not rendering → Check ResponsiveContainer height
- Transfers appearing → Add `.is('transfer_group_id', null)` to queries
- Wrong totals → Check cents vs pesos conversion
- Slow performance → Limit data points, add memoization
- Type errors → Add Recharts type imports

---

## Next Steps

Once all verifications pass:

1. ✅ Mark chunk 044 complete in progress tracker
2. ✅ Commit analytics code with message: "feat: add advanced analytics dashboard (chunk 044)"
3. ➡️ Proceed to **Chunk 045: E2E Tests** (verify analytics in E2E suite)
4. 📚 Reference this verification if analytics issues arise later

---

**Verification completed by**: ********\_********
**Date**: ********\_********
**Browsers tested**: Chrome ☐ Firefox ☐ Safari ☐ iOS Safari ☐
**All checks passed**: YES ☐ NO ☐ PARTIAL ☐

**Notes**:
