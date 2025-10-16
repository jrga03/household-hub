# Troubleshooting: Budgets UI

Common issues and solutions when building the budgets interface.

---

## Component Issues

### Problem: BudgetList shows "No Budgets Set" despite budgets existing

**Symptoms**:

- Budgets exist in database
- UI shows empty state

**Cause**: Query not fetching data or household_id mismatch

**Solution**:
Check query parameters:

```typescript
// Verify household_id matches
console.log("Fetching budgets for:", householdId, monthKey);

// Check query result
const { data, error } = useBudgets(householdId, monthKey);
console.log("Budgets data:", data);
console.log("Error:", error);
```

Verify month_key is correct format (YYYYMM):

```typescript
// January 2024 should be: 202401
const date = new Date("2024-01-01");
const monthKey = date.getFullYear() * 100 + (date.getMonth() + 1);
console.log(monthKey); // Should be 202401
```

---

### Problem: Progress bar shows incorrect percentage

**Symptoms**:

- Percentage doesn't match actual/target ratio
- Shows 150% when spent ₱3,000 of ₱10,000

**Cause 1**: Transfers not excluded from actual calculation

**Solution**:
Verify `useBudgetActuals` excludes transfers:

```typescript
const { data: transactions } = await supabase
  .from("transactions")
  .select("category_id, amount_cents")
  .eq("type", "expense")
  .is("transfer_group_id", null); // CRITICAL
```

**Cause 2**: Wrong date range for month

**Solution**:
Check month boundaries:

```typescript
const startOfMonth = new Date(month); // '2024-01-01'
const endOfMonth = new Date(startOfMonth);
endOfMonth.setMonth(endOfMonth.getMonth() + 1);
endOfMonth.setDate(0); // Last day of month

console.log("Range:", startOfMonth, endOfMonth);
// Should be: 2024-01-01 to 2024-01-31
```

---

## Form Issues

### Problem: Cannot submit budget form

**Symptoms**:

- Button click does nothing
- No error messages

**Cause**: Validation failing silently

**Solution**:
Check form errors:

```typescript
const onSubmit = (data: FormData) => {
  console.log("Form data:", data);
  console.log("Form errors:", form.formState.errors);
};

// Or add this to see errors:
console.log("Form state:", form.formState);
```

Common validation issues:

- category_id empty string (not selected)
- amount_cents is 0 or negative
- month format incorrect (should be 'YYYY-MM-01')

---

### Problem: Currency input not updating form value

**Symptoms**:

- Type amount in input
- Form submits with 0 or old value

**Cause**: Controller not wired correctly

**Solution**:
Verify Controller field binding:

```typescript
<Controller
  name="amount_cents"
  control={form.control}
  render={({ field }) => (
    <CurrencyInput
      {...field}  // This spreads value and onChange
      // Don't manually set value/onChange here
    />
  )}
/>
```

Check CurrencyInput passes cents to onChange:

```typescript
// In CurrencyInput component
const handleBlur = (e) => {
  const cents = parsePHP(displayValue);
  onChange?.(cents); // Must pass number, not string
};
```

---

## Data Issues

### Problem: Budget actuals don't update after creating transaction

**Symptoms**:

- Create expense transaction
- Budget progress stays at 0%
- Refresh page and it updates

**Cause**: Cache not invalidating

**Solution**:
Check query key matching in invalidation:

```typescript
// In useCreateTransaction:
onSuccess: () => {
  queryClient.invalidateQueries({
    queryKey: ["budget-actuals"], // Must match useBudgetActuals key
  });
};
```

Or force refresh:

```typescript
const { data, refetch } = useBudgetActuals(householdId, month);

// After creating transaction:
await refetch();
```

---

### Problem: Copy previous month creates duplicates

**Symptoms**:

- Click "Copy from Previous Month"
- Get database unique constraint error
- Or budgets appear twice

**Cause**: Upsert not working or clicking multiple times

**Solution**:
Verify upsert uses correct conflict columns:

```typescript
await supabase.from("budgets").upsert(newBudgets, {
  onConflict: "household_id,category_id,month", // Must match unique constraint
});
```

Disable button while loading:

```typescript
<Button
  onClick={handleCopyPreviousMonth}
  disabled={copyBudgets.isPending}
>
  {copyBudgets.isPending ? 'Copying...' : 'Copy from Previous Month'}
</Button>
```

---

## Query Issues

### Problem: Slow budget vs actual calculation

**Symptoms**:

- Page takes 5+ seconds to load
- Progress bars render slowly

**Cause**: Missing indexes or inefficient query

**Solution**:
Verify indexes exist:

```sql
-- Check budgets indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'budgets';

-- Should include:
-- idx_budgets_household_month (for fast month queries)
```

Optimize query with month_key:

```typescript
// ❌ Slow:
.eq('month', '2024-01-01')

// ✅ Fast:
.eq('month_key', 202401)
```

Use query caching:

```typescript
const { data } = useQuery({
  queryKey: ["budget-actuals", householdId, month],
  queryFn: fetchBudgetActuals,
  staleTime: 60 * 1000, // Cache for 1 minute
});
```

---

## UI Issues

### Problem: Progress bar colors not showing correctly

**Symptoms**:

- All progress bars are same color
- Green/yellow/red not applied

**Cause**: Tailwind CSS not configured or classes not whitelisted

**Solution**:
Check Tailwind config includes color classes:

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Include all component files
  ],
  // ...
};
```

Ensure classes are applied conditionally:

```typescript
const progressColors = {
  under: 'bg-green-600',
  near: 'bg-amber-500',
  over: 'bg-red-600',
};

<Progress
  indicatorClassName={progressColors[status]} // Dynamic class
/>
```

---

### Problem: Month navigation breaks with invalid dates

**Symptoms**:

- Click previous/next month
- Page shows error or NaN

**Cause**: Date manipulation creating invalid dates

**Solution**:
Handle month rollover correctly:

```typescript
const handleNextMonth = () => {
  const date = new Date(selectedMonth);
  date.setMonth(date.getMonth() + 1);

  // Format as YYYY-MM-01
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  setSelectedMonth(`${year}-${month}-01`);
};
```

---

## Performance Issues

### Problem: Re-renders on every keystroke in form

**Symptoms**:

- Typing in amount input feels laggy
- Console shows many re-renders

**Cause**: Form re-rendering entire component tree

**Solution**:
Memo expensive components:

```typescript
export const BudgetProgressBar = React.memo(({ target, actual, categoryName }) => {
  // Component code
});
```

Use React Hook Form's mode:

```typescript
const form = useForm({
  mode: "onBlur", // Only validate on blur, not on change
  // ...
});
```

---

## TypeScript Issues

### Problem: Type errors with Budget interface

**Symptoms**:

```
Property 'categories' does not exist on type 'Budget'
```

**Cause**: Query join not reflected in TypeScript type

**Solution**:
Extend Budget interface:

```typescript
interface BudgetWithCategory extends Budget {
  categories: {
    id: string;
    name: string;
    parent_id: string | null;
    color: string;
    icon: string;
  };
}

// Use in query:
const { data } = await supabase
  .from("budgets")
  .select(
    `
    *,
    categories (id, name, parent_id, color, icon)
  `
  )
  .returns<BudgetWithCategory[]>();
```

---

## Prevention Tips

1. **Always exclude transfers**: Add comment in query to remember
2. **Use month_key for performance**: Integer queries are faster
3. **Cache aggressively**: Budget data doesn't change often
4. **Validate month format**: Always use 'YYYY-MM-01'
5. **Test with real data**: Create 10+ budgets to test performance
6. **Verify query invalidation**: Check React Query DevTools

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide
2. Use React Query DevTools to inspect queries
3. Check browser console for errors
4. Verify database queries with `EXPLAIN ANALYZE`
5. Test transfer exclusion pattern
6. Review chunk 015 (budgets schema) for database setup

---

## Quick Fixes

```bash
# Clear React Query cache
# In browser console:
queryClient.clear()

# Force refetch
queryClient.invalidateQueries(['budgets'])
queryClient.invalidateQueries(['budget-actuals'])

# Check database
npx supabase db shell
SELECT * FROM budgets WHERE month_key = 202401;
```

---

**Remember**: Transfers MUST be excluded when calculating actual spending. This is the #1 source of budget calculation errors.
