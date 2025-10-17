# Chunk 013: Basic Dashboard

## At a Glance

- **Time**: 90 minutes
- **Milestone**: MVP (10 of 11)
- **Prerequisites**: Chunks 010 (transactions), 011 (balances), 012 (category totals)
- **Can Skip**: No - central hub for financial overview

## What You're Building

Comprehensive financial dashboard with at-a-glance insights:

- **Summary Cards**: Total income, expenses, net amount, account count
- **Monthly Chart**: Income vs expenses trend (last 6 months)
- **Category Breakdown**: Spending distribution pie/bar chart with click navigation
- **Recent Transactions**: Last 10 transactions with quick actions
- **Account Summaries**: Current balances for all accounts
- **Quick Stats**: Transaction counts, active days, unique categories

**Note**: Static display only in this chunk. Interactive column sorting for tables is handled in advanced table components from earlier chunks.

## Why This Matters

The dashboard is **the primary interface** for users:

- First screen users see after login
- Quick financial health overview
- Identifies problems at a glance (overspending, low balances)
- Motivates users with visual progress
- Reduces need to navigate multiple pages

Without a dashboard, users must dig through multiple views to understand their finances.

## Before You Start

Make sure you have:

- Chunks 001-012 completed
- useAccountBalances hook working (chunk 011)
- useCategoryTotals hook working (chunk 012)
- useTransactions hook with filters (chunk 010)
- **MonthSelector component created** (chunk 012, step 2)
- Recharts library installed
- formatPHP utility functioning

## What Happens Next

After this chunk:

- Landing page shows financial overview
- Charts visualize spending patterns
- Quick access to recent activity
- Account status visible
- **Dashboard complete - ready for budgets!**

## Key Files Created

```
src/
├── routes/
│   └── index.tsx                      # Dashboard home page
├── components/
│   ├── dashboard/
│   │   ├── SummaryCards.tsx          # Income/Expense/Net cards
│   │   ├── MonthlyChart.tsx          # Income vs expense chart
│   │   ├── CategoryChart.tsx         # Category spending breakdown
│   │   ├── RecentTransactions.tsx    # Last 10 transactions
│   │   └── AccountSummaries.tsx      # Account balance cards
└── lib/
    └── supabaseQueries.ts            # useDashboardData hook
```

## Features Included

### Summary Cards

- Total Income (current month)
- Total Expenses (current month)
- Net Amount (income - expenses)
- Account count with total balance
- Comparison with previous month

### Monthly Trend Chart

- Last 6 months of income/expense data
- Line or bar chart (Recharts)
- Color-coded (green income, red expenses)
- Interactive tooltips
- Month labels on X-axis

**Note**: Year-over-year comparison (mentioned in IMPLEMENTATION-PLAN.md Day 14) is intentionally deferred to a future advanced analytics chunk. The 6-month trend provides sufficient insight for the MVP while keeping the dashboard focused and performant.

### Category Breakdown

- Pie chart or horizontal bar chart
- Top 5-10 spending categories
- Color-coded by category
- Percentage labels
- Click to view category details

### Recent Transactions

- Last 10 transactions
- Amount, category, account, date
- Quick edit/delete actions
- Link to full transaction list
- Status indicators (pending/cleared)

### Account Summaries

- Mini cards for each account
- Current balance
- Account type icon
- Link to account detail
- Color-coded by account

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 14 (lines 279-286)
- **Original**: `docs/initial plan/DATABASE.md` lines 440-474 (Monthly Summary Query)
- **Decisions**: #64 (indexes for performance)

## Technical Stack

- **TanStack Query**: Data aggregation
- **Recharts**: Charts (Line, Pie, Bar)
- **date-fns**: Date manipulation
- **formatPHP**: Currency display
- **shadcn/ui**: Card, Skeleton components
- **lucide-react**: Icons

## Design Patterns

### Dashboard Data Aggregation Pattern

```typescript
const { data, isLoading } = useDashboardData(selectedMonth);

// Returns:
// {
//   summary: { income, expenses, netAmount, accountCount, totalBalance },
//   monthlyTrend: [{ month, income, expenses }],
//   categoryBreakdown: [{ category, amount, percent, color }],
//   recentTransactions: [...],
//   accountSummaries: [...]
// }
```

### Summary Card Pattern

```typescript
<SummaryCard
  title="Total Income"
  amount={summary.income}
  icon={TrendingUp}
  trend={+15.2}  // Percentage change from previous month
  color="green"
/>
```

### Recharts Pattern

```typescript
<LineChart data={monthlyTrend}>
  <XAxis dataKey="month" />
  <YAxis />
  <Tooltip content={<CustomTooltip />} />
  <Line dataKey="income" stroke="#10b981" />
  <Line dataKey="expense" stroke="#ef4444" />
</LineChart>
```

## Common Pitfalls

1. **Including transfers**: Transfers MUST be excluded from income/expense summaries
2. **Slow queries**: Aggregate multiple queries efficiently
3. **Empty state**: Handle months with no data gracefully
4. **Chart overflow**: Limit category chart to top 10 categories
5. **Stale data**: Invalidate cache when transactions change

## Performance Considerations

**Query Optimization**:

- Single query for dashboard data (avoid N+1)
- Use indexes: `idx_transactions_month`, `idx_transactions_category_date`
- Cache dashboard data for 30 seconds
- Lazy load charts (only when visible)

**Target Performance**: <200ms total dashboard load time

---

**Ready?** → Open `INSTRUCTIONS.md` to begin
