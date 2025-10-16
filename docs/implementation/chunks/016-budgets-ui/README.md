# Chunk 016: Budgets UI

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: MVP (Optional)
- **Prerequisites**: Chunk 015 (budgets schema), Chunk 007 (categories)
- **Can Skip**: Yes - budgets are optional feature

## What You're Building

Complete budget management interface:

- Monthly budget form with category selection
- Budget vs actual comparison display
- Progress indicators (under/over budget)
- Copy from previous month feature
- Monthly budget target editor
- Visual budget health indicators

## Why This Matters

Budgets help users track their spending against monthly targets. The UI needs to clearly show:

- How much they planned to spend (target)
- How much they actually spent (calculated from transactions)
- How much remains (or overspent)

This visualization helps users make informed financial decisions.

## Before You Start

Make sure you have:

- Chunk 015 completed (budgets table exists)
- Chunk 007 completed (categories exist)
- Currency utilities working (formatPHP, parsePHP)
- Basic UI components installed (shadcn/ui)
- TanStack Query configured

## What Happens Next

After this chunk:

- Users can set monthly budget targets per category
- Real-time budget vs actual calculations
- Visual feedback on budget health
- Easy budget copying between months
- Ready for production budget tracking

## Key Files Created

```
src/
├── components/
│   └── budgets/
│       ├── BudgetForm.tsx           # Create/edit budget targets
│       ├── BudgetList.tsx           # Monthly budget overview
│       ├── BudgetProgressBar.tsx    # Visual progress indicator
│       └── BudgetCard.tsx           # Individual category budget
├── routes/
│   └── budgets.tsx                  # Budgets page route
└── hooks/
    ├── useBudgets.ts                # Budget queries
    └── useBudgetActuals.ts          # Actual spending calculations
```

## Features Included

### Budget Form

- Month selection (date picker)
- Category selection (hierarchical)
- Amount input (PHP currency)
- Quick copy from previous month
- Bulk edit mode (set multiple at once)

### Budget Display

- Per-category progress bars
- Percentage indicators (75% spent, 125% over)
- Color-coded status (green/yellow/red)
- Actual vs target comparison
- Remaining/overspent amounts

### Budget Management

- Edit existing budgets
- Delete unused budgets
- Copy entire month forward
- Reset to zero
- Bulk operations

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 265-294 (budgets schema)
- **Original**: `docs/initial plan/DECISIONS.md` #80 (budgets philosophy)
- **Architecture**: Reference targets, not balances
- **Query Pattern**: Always exclude transfers from actual calculations

## Technical Stack

- **React 19**: Component architecture
- **TanStack Query**: Data fetching and caching
- **React Hook Form**: Form state management
- **Zod**: Budget validation
- **shadcn/ui**: Button, Input, Card, Progress components
- **Sonner**: Success/error toasts

## Design Patterns

### Budget vs Actual Calculation

```typescript
interface BudgetComparison {
  categoryId: string;
  categoryName: string;
  target: number; // From budgets table
  actual: number; // Calculated from transactions
  remaining: number; // target - actual
  percentage: number; // (actual / target) * 100
  status: "under" | "near" | "over"; // <80%, 80-100%, >100%
}

// Query pattern:
const budgetActuals = useBudgetActuals(household_id, month);
// Returns: Array<BudgetComparison>
```

### Copy Previous Month Pattern

```typescript
async function copyBudgets(fromMonth: string, toMonth: string) {
  // Fetch previous month budgets
  const previousBudgets = await fetchBudgets(fromMonth);

  // Insert into new month (upsert to handle existing)
  for (const budget of previousBudgets) {
    await supabase.from("budgets").upsert(
      {
        household_id: budget.household_id,
        category_id: budget.category_id,
        month: toMonth,
        amount_cents: budget.amount_cents,
      },
      {
        onConflict: "household_id,category_id,month",
      }
    );
  }
}
```

## Critical Concepts

**Transfer Exclusion**:

```typescript
// ALWAYS exclude transfers when calculating actual spending
const { data: actualSpending } = await supabase
  .from("transactions")
  .select("category_id, amount_cents")
  .eq("household_id", householdId)
  .eq("type", "expense")
  .gte("date", startOfMonth)
  .lte("date", endOfMonth)
  .is("transfer_group_id", null); // CRITICAL!
```

**Month Boundaries**:

- Use first day of month format: '2024-01-01'
- Use month_key for queries: 202401
- Handle user timezone from profiles table

**Budget Status Colors**:

- Green: < 80% spent (safe zone)
- Yellow: 80-100% spent (warning)
- Red: > 100% spent (over budget)

---

**Ready?** → Open `instructions.md` to begin
