# Chunk 044: Analytics Dashboard

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Phase C - Production (4 of 6 - OPTIONAL)
- **Prerequisites**:
  - **Chunk 013** (basic-dashboard) - Provides Recharts library, basic charts, dashboard route
  - **Chunk 010** (transactions-list) - Transaction data queries
  - **Chunk 014** (budgets-basic) - Budget data for variance analysis
  - **Chunk 006** (currency-system) - formatPHP utility
- **Can Skip**: **YES** - Nice-to-have feature, not critical for MVP

## Relationship to Chunk 013

**Important**: This chunk **extends** the basic dashboard from chunk 013 with advanced analytics features.

| Feature        | Chunk 013 (Basic Dashboard)    | Chunk 044 (Analytics Dashboard)     |
| -------------- | ------------------------------ | ----------------------------------- |
| **Route**      | `/` (home/index)               | `/analytics` (dedicated page)       |
| **Purpose**    | Quick financial overview       | Deep analytical insights            |
| **Charts**     | 6-month trend + top categories | Advanced multi-chart analysis       |
| **Filters**    | Month selector                 | Account, category, type, date range |
| **Insights**   | Summary cards only             | Budget variance, YoY, trends        |
| **Complexity** | Simple aggregates              | Complex calculations                |

**Why both?** The basic dashboard (013) serves as the home page with at-a-glance info. This analytics dashboard (044) provides power users with deeper insights and customizable analysis.

## What You're Building

Interactive analytics dashboard with **advanced** financial insights:

- **Advanced filtering**: By account, category, transaction type, custom date ranges
- **Budget variance analysis**: See how actual spending compares to budgets
- **Year-over-year comparison**: Track financial progress across years
- **Spending insights**: Average monthly spending, largest transactions, top categories
- **Interactive charts**: Click, filter, and explore your financial data
- **Responsive design**: Works on desktop, tablet, and mobile

## Why This Matters

Analytics provide **actionable financial insights**:

- **Spending patterns**: Identify where money goes
- **Trend analysis**: See changes over time
- **Budget tracking**: Visual budget vs actual
- **Category insights**: Top spending categories
- **Forecasting**: Predict future expenses
- **Decision support**: Data-driven financial decisions

**Note**: This is an optional enhancement. Core app works without it.

## Related Documentation

- **Original Plan**: `docs/initial plan/IMPLEMENTATION-PLAN.md`
  - Day 14 Afternoon (lines 490-522) - Analytics implementation
  - Budget variance pattern (lines 491-496)
  - Deliverables checklist (lines 515-521)
- **Database Patterns**: `docs/initial plan/DATABASE.md`
  - Transfer exclusion (lines 476-523) - **CRITICAL pattern**
  - Budget vs Actual queries (lines 491-499)
  - Monthly summary aggregates (lines 440-474)
- **Architecture**: `docs/initial plan/ARCHITECTURE.md`
  - Recharts in tech stack
  - Performance budgets for charts
- **Chunk 013**: Basic dashboard this extends
- **External**: [Recharts Documentation](https://recharts.org/en-US/)

## Key Files Created/Modified

**New Files** (created in this chunk):

```
src/
├── hooks/
│   └── useAnalytics.ts              # Advanced analytics data hook
├── components/
│   ├── analytics/
│   │   ├── AnalyticsDashboard.tsx   # Main analytics container
│   │   ├── FilterPanel.tsx          # Account/category/date filters
│   │   ├── InsightsSection.tsx      # Key metrics and insights
│   │   └── BudgetVarianceCard.tsx   # Budget vs actual display
│   └── charts/                      # Advanced chart components
│       ├── YearOverYearChart.tsx    # YoY comparison chart
│       └── BudgetProgressChart.tsx  # Budget utilization bars
└── routes/
    └── analytics.tsx                # Analytics route (/analytics)
```

**Reused from Chunk 013** (already exist, not modified):

```
src/
├── components/
│   └── charts/
│       ├── SpendingTrendChart.tsx   # From chunk 013
│       └── CategoryPieChart.tsx     # From chunk 013
└── lib/
    └── currency.ts                  # formatPHP from chunk 006
```

## Features Included

### Charts (Interactive Visualizations)

1. **Spending Trend Chart** (from chunk 013, reused)
   - Line chart showing income vs expenses over time
   - Configurable date range (default: last 6 months)
   - Interactive tooltips with formatted PHP amounts

2. **Category Breakdown** (from chunk 013, reused)
   - Pie chart showing top 10 spending categories
   - Color-coded segments
   - Percentage labels
   - Click to filter by category

3. **Budget Progress Bars** (NEW in this chunk)
   - Horizontal progress bars for each budget
   - Shows actual vs target spending
   - Color-coded: green (under budget), yellow (near limit), red (over budget)
   - Displays variance amount and percentage used

4. **Year-over-Year Comparison** (NEW in this chunk)
   - Bar chart comparing current year vs previous year
   - Shows income and expenses side-by-side
   - Calculates percentage change
   - Highlights trends (increasing/decreasing)

### Insights Section (NEW in this chunk)

- **Top Categories**: 5 highest spending categories with amounts
- **Average Monthly Spending**: Mean expense per month in selected range
- **Largest Transactions**: Top 5 biggest expenses
- **Budget Health**: Summary of over/under budget categories
- **Spending Velocity**: Daily/weekly average spending rate

### Advanced Filters (NEW in this chunk)

- **Date Range Picker**: Custom start and end dates
- **Account Filter**: Filter by specific account(s)
- **Category Filter**: Filter by category or parent category
- **Transaction Type**: Toggle income/expense/both
- **Status Filter**: Cleared vs pending transactions

### Data Aggregations

- Total income and expenses for selected period
- Net amount (income - expenses)
- Budget variance (budgeted vs actual)
- Period-over-period comparison
- Category-level breakdowns

---

**Ready?** → Open `instructions.md` to begin
