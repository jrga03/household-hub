# Troubleshooting: Transactions List with Advanced Filtering

Common issues with transaction filtering.

---

## Filter Issues

### Problem: Filters don't update URL

**Cause**: Not using TanStack Router's navigate function

**Solution**:

```typescript
// WRONG:
const [filters, setFilters] = useState({});

// CORRECT:
const search = Route.useSearch();
const navigate = Route.useNavigate();

const updateFilters = (newFilters) => {
  navigate({
    search: (prev) => ({ ...prev, ...newFilters }),
  });
};
```

---

### Problem: Filters reset on page refresh

**Cause**: Not reading from URL search params

**Solution**:

```typescript
// In route file:
export const Route = createFileRoute("/transactions")({
  component: Transactions,
  validateSearch: (search): Filters => ({
    dateFrom: search.dateFrom as string,
    // ... other filters
  }),
});

// In component:
const search = Route.useSearch(); // ← Read from URL
```

---

## Search Issues

### Problem: Too many queries firing

**Cause**: Search not debounced

**Solution**:

```typescript
import { useDebounce } from "@/lib/hooks/useDebounce";

const debouncedSearch = useDebounce(search.search, 300);

const { data } = useTransactions({
  ...filters,
  search: debouncedSearch, // ← Use debounced value
});
```

---

### Problem: Search doesn't find results

**Cause**: Case-sensitive or wrong field search

**Solution**:

```typescript
// In Supabase query:
if (filters?.search) {
  query = query.or(`description.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
  // ↑ Use .ilike for case-insensitive
}
```

---

## Transfer Exclusion Issues

### Problem: Transfers still showing

**Cause**: Not excluding transfers in query

**Solution**:

```typescript
// CRITICAL: Default to true
if (filters?.excludeTransfers !== false) {
  query = query.is("transfer_group_id", null);
}
```

---

### Problem: Can't see transfers when toggle OFF

**Cause**: Toggle state not passed to query

**Solution**:

```typescript
// In filter component:
<Switch
  checked={filters.excludeTransfers !== false} // ← Default true
  onCheckedChange={(checked) =>
    onFiltersChange({ ...filters, excludeTransfers: checked })
  }
/>
```

---

## Date Filter Issues

### Problem: Date range excludes end date

**Cause**: Using `lt` instead of `lte`

**Solution**:

```typescript
// WRONG:
query = query.lt("date", filters.dateTo);

// CORRECT:
query = query.lte("date", filters.dateTo); // ← Less than or equal
```

---

### Problem: Date picker shows wrong date

**Cause**: Not parsing Date string correctly

**Solution**:

```typescript
import { parseISO } from "date-fns";

<DatePicker
  value={filters.dateFrom ? parseISO(filters.dateFrom) : undefined}
  // ↑ Parse ISO date string to Date object
  onChange={handleDateFromChange}
/>
```

---

## URL State Issues

### Problem: Boolean filters not working

**Cause**: URL params are always strings

**Solution**:

```typescript
// In validateSearch:
validateSearch: (search): Filters => ({
  excludeTransfers:
    search.excludeTransfers === "false" ? false : true,
  // ↑ String "false" → boolean false
}),
```

---

### Problem: Filters lost on navigation

**Cause**: Not using relative navigation

**Solution**:

```typescript
// Keep existing search params:
navigate({
  search: (prev) => ({ ...prev, ...newFilters }),
  // ↑ Merge with previous
});
```

---

## Performance Issues

### Problem: Slow queries with filters

**Cause**: Missing indexes

**Solution**:
Check DATABASE.md lines 863-878 for required indexes:

```sql
-- Ensure these indexes exist:
CREATE INDEX idx_transactions_date ON transactions(date DESC);
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date DESC);
CREATE INDEX idx_transactions_category_date ON transactions(category_id, date DESC);
CREATE INDEX idx_transactions_status_date ON transactions(status, date DESC);
```

---

### Problem: UI freezes with large datasets

**Cause**: Not using virtual scrolling

**Solution**:
Implement TanStack Virtual:

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

const parentRef = useRef<HTMLDivElement>(null);

const rowVirtualizer = useVirtualizer({
  count: transactions.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60, // Row height in px
});
```

---

## Category Selector Issues

### Problem: Can select parent categories

**Expected**: This is wrong! Only children should be selectable.

**Solution**:

```typescript
// In CategorySelector:
{categories?.map((parent) => (
  <SelectGroup key={parent.id}>
    <SelectLabel>{parent.name}</SelectLabel> {/* ← Not selectable */}
    {parent.children.map((child) => (
      <SelectItem key={child.id} value={child.id}> {/* ← Selectable */}
        {child.name}
      </SelectItem>
    ))}
  </SelectGroup>
))}
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

if (!transactions || transactions.length === 0) {
  return <EmptyState />;
}

return <TransactionList />; // ← Only show when loaded
```

---

## Account Filter Issues

### Problem: Account filter doesn't work

**Cause**: Wrong field name

**Solution**:

```typescript
// WRONG:
query = query.eq("account", filters.accountId);

// CORRECT:
query = query.eq("account_id", filters.accountId);
// ↑ Use snake_case field name
```

---

## Clear Filters Issues

### Problem: Clear doesn't reset transfer toggle

**Cause**: Not preserving default

**Solution**:

```typescript
const clearFilters = () => {
  onFiltersChange({
    excludeTransfers: true, // ← Keep this default
  });
};
```

---

## Type Coercion Issues

### Problem: Filter comparison fails

**Cause**: String vs null comparison

**Solution**:

```typescript
// In validateSearch:
status: search.status === "all"
  ? null
  : (search.status as "pending" | "cleared" | null),
// ↑ Convert "all" string to null
```

---

## Quick Fixes

```bash
# Check query performance
# In browser console:
performance.now();

# Clear React Query cache
queryClient.clear();

# Force refetch
queryClient.invalidateQueries({ queryKey: ["transactions"] });

# Check URL state
console.log(window.location.search);

# Verify filter object
console.log(filters);
```

---

## Database Query Debugging

```typescript
// Add to query function:
console.log("Filters applied:", filters);

const { data, error } = await query;

if (error) {
  console.error("Query error:", error);
  console.error("Query details:", query);
}

// Check Supabase dashboard for slow queries
```

---

## Common Mistakes Checklist

- [ ] Not debouncing search input
- [ ] Forgetting transfer exclusion default
- [ ] Missing compound indexes on transactions table
- [ ] Not using `ilike` for case-insensitive search
- [ ] Not handling URL string → boolean conversion
- [ ] Clearing filters removes transfer exclusion
- [ ] Not merging with previous search params
- [ ] Wrong field names (camelCase vs snake_case)

---

**Remember**: Filters should feel instant. If queries take >100ms, check indexes in DATABASE.md and optimize the query.
