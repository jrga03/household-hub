# Chunk 012: Category Totals

## At a Glance

- **Time**: 60 minutes
- **Milestone**: MVP (9 of 11)
- **Prerequisites**: Chunks 005 (categories), 009 (transactions), 010 (filtering)
- **Can Skip**: No - essential for spending analysis

## What You're Building

Monthly spending analysis by category with parent rollups:

- **Category Totals**: Monthly expenses/income per child category
- **Parent Rollups**: Automatic summing of child categories
- **Monthly View**: Spending breakdown for selected month
- **Comparison**: Current vs previous month percentages
- **Visual Display**: Color-coded category cards with progress bars
- **Transfer Exclusion**: Only real income/expenses (not transfers)

## Why This Matters

Category totals are **essential for financial insights**:

- Users need to see "where does my money go?"
- Identify spending patterns across categories
- Compare monthly spending trends
- Detect overspending in specific categories
- Foundation for budget vs actual analysis (chunk 014)

Without category analytics, users can't understand spending behavior.

## Before You Start

Make sure you have:

- Chunks 001-010 completed
- Category hierarchy (parent → child)
- Transactions with category_id
- Transfer exclusion pattern understood
- formatPHP utility working

## What Happens Next

After this chunk:

- Monthly spending visible by category
- Parent categories show totals of children
- Comparison with previous month
- Percentage breakdown of total spending
- Visual spending distribution
- **Category analysis complete!**

## Key Files Created

```
src/
├── routes/
│   └── analytics/
│       └── categories.tsx          # Category totals page
├── components/
│   ├── CategoryTotalCard.tsx       # Individual category display
│   ├── CategoryTotalsList.tsx      # List with rollups
│   └── MonthSelector.tsx           # Month navigation
└── lib/
    └── supabaseQueries.ts          # useCategoryTotals hook
```

## Features Included

### Category Totals Calculation

- **Per-child total**: Sum of expenses for each child category
- **Parent rollup**: Sum all children under parent
- **Monthly scope**: Totals for selected month
- **Transfer exclusion**: WHERE transfer_group_id IS NULL
- **Type filtering**: Separate income and expense totals

### Visual Display

- Category cards with color indicators
- Percentage of total spending
- Amount formatted in PHP currency
- Transaction count per category
- Comparison with previous month

### Parent Hierarchy Display

- Parent category headers (non-selectable)
- Children indented under parents
- Parent total = sum of children
- Expandable/collapsible sections

### Month Navigation

- Select any month
- Previous/Next month buttons
- Current month highlighted
- Comparison with previous month

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 397-438 (Category Totals Query)
- **Original**: `docs/initial plan/DATABASE.md` lines 476-504 (Transfer Exclusion Pattern)
- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 6 (lines 237-262)
- **Decisions**: #60 (transfer exclusion)

## Technical Stack

- **TanStack Query**: Category totals query with caching
- **Supabase**: Recursive CTE for category tree
- **date-fns**: Month manipulation
- **formatPHP**: Currency display
- **shadcn/ui**: Card, Select components
- **Recharts**: Optional spending chart

## Design Patterns

### Category Totals Query Pattern

```typescript
const { data: totals } = useCategoryTotals(month);

// Returns hierarchy:
// [
//   {
//     parentId: null,
//     parentName: "Food",
//     totalExpense: 50000, // Sum of children
//     children: [
//       { id: "...", name: "Groceries", expense: 30000, income: 0, count: 15 },
//       { id: "...", name: "Dining", expense: 20000, income: 0, count: 8 }
//     ]
//   }
// ]
```

### Parent Rollup Pattern

```typescript
// Calculate parent total from children
const parentTotal = children.reduce((sum, child) =>
  sum + child.expense_cents, 0
);

// Display hierarchy
<CategoryGroup name={parent.name} total={parentTotal}>
  {children.map(child =>
    <CategoryCard category={child} />
  )}
</CategoryGroup>
```

### Transfer Exclusion Pattern

```typescript
// CRITICAL: Always exclude transfers from analytics
const query = supabase
  .from("transactions")
  .select("category_id, amount_cents, type")
  .is("transfer_group_id", null) // ← Exclude transfers
  .gte("date", startOfMonth)
  .lte("date", endOfMonth);
```

## Common Pitfalls

1. **Including transfers**: Transfers MUST be excluded (WHERE transfer_group_id IS NULL)
2. **Parent categories with transactions**: Only children should have direct transactions
3. **Missing parent rollup**: Parent total must sum all children
4. **Wrong month boundaries**: Use DATE_TRUNC('month', date) for grouping
5. **Type confusion**: Separate income and expense calculations

## Performance Considerations

**Query Optimization** (see DATABASE.md lines 816-837):

- Use compound index: `idx_transactions_category_date`
- Use month index: `idx_transactions_month`
- Filter by household_id first
- Exclude transfers in WHERE clause

**Target Performance**: <100ms for 1000 transactions/month

---

**Ready?** → Open `INSTRUCTIONS.md` to begin
