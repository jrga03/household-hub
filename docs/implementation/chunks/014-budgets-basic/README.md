# Chunk 014: Budgets Basic

## At a Glance

- **Time**: 120 minutes
- **Milestone**: MVP (11 of 11) - **FINAL CHUNK!**
- **Prerequisites**: Chunks 012 (category totals), 013 (dashboard)
- **Can Skip**: No - core feature for financial planning

## What You're Building

Complete budget management system with tracking:

- **Budget Creation**: Set monthly spending targets per category
- **Budget vs Actual**: Compare planned spending to reality
- **Progress Visualization**: Progress bars showing budget usage
- **Budget List**: All category budgets for selected month
- **Copy Previous**: Easily replicate last month's budgets
- **Budget Alerts**: Visual warnings when approaching/exceeding limits

## Why This Matters

Budgets are **critical for financial discipline**:

- Users set spending goals and track progress
- Identify overspending before it's too late
- Motivate savings by visualizing targets
- Foundation for financial planning
- Without budgets, spending is reactive not proactive

This is the **final piece of the MVP** - completing core financial tracking!

## Before You Start

Make sure you have:

- Chunks 001-013 completed
- Budgets table in database
- useCategoryTotals hook working
- Child categories with hierarchy
- formatPHP utility functioning
- Transfer exclusion pattern understood

## What Happens Next

After this chunk:

- Users can set and track budgets
- Visual budget progress indicators
- Budget vs actual comparison
- Copy budgets from previous month
- **MVP COMPLETE!** 🎉

## Key Files Created

```
src/
├── routes/
│   └── budgets/
│       └── index.tsx                # Budgets page
├── components/
│   ├── budgets/
│   │   ├── BudgetForm.tsx          # Create/edit budget
│   │   ├── BudgetList.tsx          # List of budgets
│   │   ├── BudgetCard.tsx          # Individual budget item
│   │   └── BudgetProgress.tsx      # Progress bar component
└── lib/
    └── supabaseQueries.ts          # useBudgets hook
```

## Features Included

### Budget Management

- Create budget for any child category
- Set monthly target amount in PHP
- Edit existing budgets
- Delete budgets
- Unique per category per month

### Budget Tracking

- Real-time budget vs actual comparison
- Spent amount from transactions (transfer-excluded)
- Remaining budget calculation
- Percentage used visualization

### Progress Visualization

- Progress bar (green when under budget)
- Warning state (yellow at 80-100%)
- Over budget state (red when exceeded)
- Percentage and amount labels

### Month Navigation

- View budgets for any month
- Create budgets for future months
- Copy previous month's budgets
- Month selector integration

### Budget List Display

- Grouped by parent category
- Shows target, spent, remaining
- Visual progress indicators
- Quick edit/delete actions
- Empty state for no budgets

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 265-294 (Budgets table)
- **Original**: `docs/initial plan/DATABASE.md` lines 227-239 (Budget vs Actual query)
- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 7 (lines 273-287)
- **Decisions**: #80 (budgets are reference targets, no rollover)

## Technical Stack

- **TanStack Query**: Budget data fetching
- **Supabase**: Budget CRUD operations
- **React Hook Form** + **Zod**: Budget form validation
- **shadcn/ui**: Form, Card, Progress components
- **formatPHP**: Currency display
- **date-fns**: Month manipulation

## Design Patterns

### Budget vs Actual Query Pattern

```typescript
const { data: budgets } = useBudgets(month);

// Returns:
// [
//   {
//     id: "...",
//     categoryId: "...",
//     categoryName: "Groceries",
//     categoryColor: "#10b981",
//     budgetAmountCents: 500000,  // ₱5,000 target
//     actualSpentCents: 450000,   // ₱4,500 spent
//     remainingCents: 50000,      // ₱500 remaining
//     percentUsed: 90.0,          // 90% of budget used
//     isOverBudget: false
//   }
// ]
```

### Budget Form Pattern

```typescript
const budgetSchema = z.object({
  categoryId: z.string().min(1, "Category required"),
  amountCents: z.number().min(0).max(MAX_AMOUNT_CENTS),
});

<BudgetForm
  month={selectedMonth}
  onSubmit={createBudget}
  existingBudget={editingBudget}
/>
```

### Progress Bar Pattern

```typescript
<BudgetProgress
  budgetAmountCents={500000}
  actualSpentCents={450000}
  percentUsed={90.0}
  isOverBudget={false}
/>
```

## Common Pitfalls

1. **Including transfers**: Actual spending MUST exclude transfers
2. **Duplicate budgets**: Enforce unique constraint (category + month)
3. **Wrong month**: Ensure budget month matches displayed month
4. **Parent categories**: Only child categories should have budgets
5. **No rollover**: Each month's budgets are independent

## Performance Considerations

**Query Optimization** (see DATABASE.md lines 1038-1065):

- Use compound index: `idx_budgets_household_month`
- Use month_key for efficient lookups
- Join with transactions using `idx_transactions_category_date`
- Exclude transfers in actual spending calculation

**Target Performance**: <150ms for 20 budget categories

---

**Ready?** → Open `INSTRUCTIONS.md` to begin
