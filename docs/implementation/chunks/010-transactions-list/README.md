# Chunk 010: Transactions List with Advanced Filtering

## At a Glance

- **Time**: 90 minutes
- **Milestone**: MVP (7 of 11)
- **Prerequisites**: Chunk 009 (transactions form)
- **Can Skip**: No - core user interface for browsing/filtering transactions

## What You're Building

Advanced transaction list view with comprehensive filtering capabilities:

- **Filter UI**: Date range, account, category, status, type, search
- **Sorting**: Default date DESC ordering (interactive column sorting in Chunk 013)
- **Search**: Full-text search across description and notes
- **URL State**: Filters persist in URL for bookmarking/sharing
- **Infinite Scroll**: TanStack Virtual for smooth scrolling through thousands of transactions
- **Transfer Control**: Toggle to show/hide transfer transactions
- **Performance**: Optimized queries with proper indexing

## Why This Matters

Users need to **quickly find specific transactions** among hundreds or thousands of entries. Effective filtering is essential for:

- Monthly expense reviews
- Finding specific purchases
- Account reconciliation
- Category-based analysis
- Status tracking (pending vs cleared)

Without good filtering, the app becomes unusable at scale.

## Before You Start

Make sure you have:

- Chunk 009 completed (transaction form and basic list)
- TransactionList component created
- formatPHP utility working (chunk 006)
- TanStack Query configured
- shadcn/ui components installed (select, input, date-picker)

## What Happens Next

After this chunk:

- Users can filter transactions by multiple criteria simultaneously
- Filters persist in URL (shareable links)
- Search works across descriptions and notes
- Transfer transactions can be hidden (important for expense analysis)
- List handles 10k+ transactions smoothly
- Sorting works on all columns
- **Transaction browsing is production-ready!**

## Key Files Created

```
src/
├── routes/
│   └── transactions.tsx            # Enhanced with filters
├── components/
│   ├── TransactionFilters.tsx      # Filter UI component
│   ├── TransactionList.tsx         # Enhanced with infinite scroll
│   └── ui/
│       └── search-input.tsx        # Debounced search input
└── lib/
    ├── supabaseQueries.ts          # useTransactions with filters
    └── hooks/
        └── useTransactionFilters.ts # URL state management
```

## Features Included

### Filter Controls

- **Date Range**: Start date + end date pickers
- **Account**: Dropdown to filter by account
- **Category**: Hierarchical category selector
- **Status**: Pending / Cleared / All
- **Type**: Income / Expense / All
- **Search**: Real-time search with debounce
- **Transfers**: Toggle to exclude transfer transactions
- **Clear Filters**: Reset all filters to default

### URL State Management

All filters stored in URL search params:

```
/transactions?dateFrom=2024-01-01&dateTo=2024-01-31&account=abc&category=xyz&status=cleared&search=grocery&excludeTransfers=true
```

### Performance Optimizations

- Debounced search (300ms delay)
- Indexed database queries (see DATABASE.md Hot Query #1)
- Virtual scrolling for large lists (TanStack Virtual)
- Optimistic UI updates
- Cached query results (TanStack Query)

### Transfer Exclusion (CRITICAL)

By default, transfers are **excluded** from the list. This prevents double-counting when analyzing spending:

- Transfer = money moved between accounts (not income/expense)
- Should be hidden for expense analysis
- Can be toggled on to view all transactions

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 6 (lines 237-262)
- **Original**: `docs/initial plan/DATABASE.md` lines 1230-1257 (Hot Query #1: Transaction List)
- **Decisions**:
  - #60: Transfer representation (must exclude from analytics)
  - #80: Infinite scroll implementation (TanStack Virtual)
  - #64: Indexes for query performance
- **Related Chunks**:
  - Chunk 011: Running account balances with cleared/pending splits
  - Chunk 012: Parent category rollups and spending aggregations

## Technical Stack

- **TanStack Router**: URL search params for filter state
- **TanStack Query**: Server state with filters
- **TanStack Virtual**: Virtual scrolling for 10k+ transactions
- **React Hook Form**: Filter form state
- **shadcn/ui**: Select, DatePicker, Input components
- **date-fns**: Date manipulation and formatting

## Design Patterns

### URL State Pattern

```typescript
// Filters stored in URL search params
const search = Route.useSearch();
const navigate = Route.useNavigate();

// Update filter
const updateFilters = (newFilters) => {
  navigate({
    search: { ...search, ...newFilters },
  });
};
```

### Debounced Search Pattern

```typescript
const [searchTerm, setSearchTerm] = useState("");
const debouncedSearch = useDebounce(searchTerm, 300);

// Only query when debounced value changes
const { data } = useTransactions({ search: debouncedSearch });
```

### Filter Builder Pattern

```typescript
// Build Supabase query from filters
let query = supabase.from("transactions").select("*");

if (filters.dateFrom) {
  query = query.gte("date", filters.dateFrom);
}
if (filters.excludeTransfers) {
  query = query.is("transfer_group_id", null); // CRITICAL
}
```

## Common Pitfalls

1. **Forgetting to exclude transfers**: Always default `excludeTransfers` to `true`
2. **Not debouncing search**: Causes too many queries
3. **Missing URL state**: Filters don't persist on refresh
4. **Poor index usage**: Slow queries without proper compound indexes
5. **Virtual scrolling bugs**: Must calculate item heights correctly

---

**Ready?** → Open `INSTRUCTIONS.md` to begin
