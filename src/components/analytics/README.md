# Analytics Components (`/src/components/analytics/`)

## Purpose

Analytics visualization components for the **Analytics Dashboard** page. Provides comprehensive financial analysis with filtering, insights, and multiple chart views (trend analysis, category breakdown, year-over-year comparison, budget tracking).

## Directory Contents

**3 component files** (15.2 KB total):

- **`AnalyticsDashboard.tsx`** (216 lines, 6.8K) - Main analytics dashboard orchestrator
- **`FilterPanel.tsx`** (165 lines, 5.6K) - Filter controls (date, account, category, type)
- **`InsightsSection.tsx`** (81 lines, 2.8K) - Key insights display (avg spending, top categories)

## Component Overview

### AnalyticsDashboard.tsx

**Purpose:** Main analytics page component that orchestrates data fetching, filtering, and chart rendering.

**Key responsibilities:**

- Fetches accounts and categories from Supabase for filter options
- Manages filter state (date range, account, category, transaction type)
- Calls `useAnalytics` hook with current filters
- Renders summary cards (total income, total expenses, net amount)
- Displays insights section and 4 chart types
- Transforms analytics data for chart components

**Data flow:**

```
User filters → Filter state → useAnalytics hook → Analytics data → Charts
```

**Summary cards displayed:**

- **Total Income** - Green card with TrendingUp icon
- **Total Expenses** - Red card with TrendingDown icon
- **Net Amount** - Shows surplus (green) or deficit (red)

**Chart integrations:**

1. **Spending Trend** - `MonthlyChart` (from dashboard/) - Monthly income vs expenses
2. **Category Breakdown** - `CategoryChart` (from dashboard/) - Pie chart of expenses by category
3. **Year-over-Year** - `YearOverYearChart` (from charts/) - YoY comparison
4. **Budget Progress** - `BudgetProgressChart` (from charts/) - Budget vs actual

**Dependencies:**

- `useAnalytics` hook for data fetching (src/hooks/useAnalytics.tsx)
- `useQuery` from TanStack Query for accounts/categories
- Chart components from `dashboard/` and `charts/` directories
- `formatPHP` for currency formatting
- `date-fns` for date manipulation

**Lines 79-94** - Data transformation logic for chart components (converts analytics API format to chart component format)

**Lines 200-215** - Color generator for pie chart (10-color palette)

### FilterPanel.tsx

**Purpose:** Comprehensive filter controls for analytics queries with date range, account, category, and type selection.

**Filter options:**

- **Date Range** - Start date and end date pickers (defaults to last 6 months)
- **Account** - Dropdown with "All accounts" or specific account
- **Category** - Dropdown with "All categories" or specific parent category
- **Type** - "All types", "Income", or "Expense"

**User interactions:**

- **Apply Filters** button - Triggers `onFilterChange` callback with current filter state
- **Clear** button - Resets all filters to defaults and re-fetches data

**Default filter values:**

- Start date: 6 months ago (first day of month)
- End date: Today
- Account: All accounts
- Category: All categories
- Type: All types

**Implementation details:**

- Uses shadcn/ui components (Select, Calendar, Popover, Button)
- Local state for each filter before applying
- Calendar popovers for date selection with formatted display
- Normalizes "all" selections to `undefined` for API calls

**Lines 38-46** - `handleApplyFilters` - Normalizes filter values and triggers parent callback

**Lines 48-58** - `handleClearFilters` - Resets to default state

### InsightsSection.tsx

**Purpose:** Display key financial insights in card format (average spending, top categories, largest transaction).

**Insights displayed:**

1. **Average Monthly Spending**
   - Shows mean spending per month over selected date range
   - Icon: TrendingUp
   - Subtext: "Per month on average"

2. **Top Spending Categories**
   - Lists top 3 categories by spending amount
   - Icon: DollarSign
   - Format: Category name + formatted amount
   - Truncates long category names

3. **Largest Transaction**
   - Shows single largest transaction in filtered period
   - Icon: Calendar
   - Displays: Amount (large), description (truncated), date
   - Date format: "MMM d, yyyy"

**Data format expected:**

```typescript
interface Insights {
  avgMonthlySpending: number; // Cents
  largestTransactions: Array<{
    description: string;
    amount: number; // Cents
    date: string; // ISO date string
  }>;
  topCategories: Array<{
    name: string;
    amount: number; // Cents
  }>;
}
```

**UI pattern:**

- 3-column grid on desktop (md:grid-cols-3)
- Stacked on mobile
- Consistent card styling with shadcn/ui Card components

## Data Flow Architecture

### 1. Component Initialization

```
AnalyticsDashboard mounts
  ↓
Fetches accounts (TanStack Query)
  ↓
Fetches categories (TanStack Query)
  ↓
Sets default filters (last 6 months)
  ↓
Calls useAnalytics hook with filters
```

### 2. Filter Application

```
User changes filters in FilterPanel
  ↓
Clicks "Apply Filters"
  ↓
FilterPanel calls onFilterChange callback
  ↓
AnalyticsDashboard updates filter state
  ↓
useAnalytics hook re-fetches with new filters
  ↓
Charts re-render with new data
```

### 3. Data Transformation

```
useAnalytics returns analytics data
  ↓
AnalyticsDashboard transforms for charts:
  - monthlyTrend → MonthlyChart format
  - categoryBreakdown → CategoryChart format
  - yearOverYear → YearOverYearChart format
  - budgetVariance → BudgetProgressChart format
  ↓
Charts render with transformed data
```

## Integration Points

### Hooks Used

**`useAnalytics(startDate, endDate, filters)`** - Primary data fetching hook

- Location: `src/hooks/useAnalytics.tsx`
- Returns: `{ data, isLoading, error }`
- Data structure: `{ totalIncome, totalExpenses, monthlyTrend, categoryBreakdown, yearOverYear, budgetVariance, insights }`

**`useQuery`** - TanStack Query for accounts/categories

- Fetches dropdown options for filters
- 5-minute stale time for caching

### Chart Components

**From `src/components/dashboard/`:**

- `MonthlyChart` - Line/bar chart for monthly trends
- `CategoryChart` - Pie chart for category breakdown

**From `src/components/charts/`:**

- `YearOverYearChart` - Year-over-year comparison chart
- `BudgetProgressChart` - Budget vs actual progress bars

### Currency Utilities

**`formatPHP(cents)`** - Formats integer cents as PHP currency

- Location: `src/lib/currency.ts`
- Usage: All monetary displays in summary cards and insights

### Date Utilities

**`date-fns`** functions:

- `subMonths` - Calculate default start date
- `startOfMonth` / `endOfMonth` - Month boundaries
- `format` - Display dates in "MMM d, yyyy" format

## State Management

### Local State (AnalyticsDashboard)

```typescript
filters: {
  startDate: Date; // Default: 6 months ago
  endDate: Date; // Default: Today
  accountId: string | undefined; // "all" → undefined
  categoryId: string | undefined; // "all" → undefined
  type: "income" | "expense" | undefined; // "all" → undefined
}
```

### Local State (FilterPanel)

```typescript
startDate: Date;
endDate: Date;
accountId: string | undefined;
categoryId: string | undefined;
type: "income" | "expense" | "all" | undefined;
```

**Note:** FilterPanel maintains separate state until "Apply Filters" is clicked, then propagates to parent.

## Key Features

### 1. Flexible Filtering

- **Date range** - Any start/end date combination
- **Account scoping** - Single account or all accounts
- **Category filtering** - Parent category only (children included automatically)
- **Transaction type** - Income only, expense only, or both

### 2. Comprehensive Insights

- **Average spending** - Normalized per month for any date range
- **Top categories** - Identifies spending patterns
- **Largest transaction** - Highlights unusual spending

### 3. Multiple Chart Views

- **Trend analysis** - Spot spending patterns over time
- **Category breakdown** - Understand spending composition
- **Year-over-year** - Compare current period to previous year
- **Budget tracking** - Monitor budget adherence

### 4. Real-time Data

- All data fetched from Supabase via TanStack Query
- Auto-refetches on filter changes
- 5-minute cache for account/category dropdowns

## UI/UX Patterns

### Loading States

```
isLoading || accountsLoading || categoriesLoading
  ↓
Display "Loading analytics..." centered message
```

### Error States

```
error
  ↓
Display red error message with error.message
```

### Empty States

- **No category data** - "No category data available" in CategoryChart card
- **No insights** - Component gracefully handles empty arrays

### Responsive Design

- **Desktop (md+):** 3-column grid for summary cards and insights
- **Desktop (md+):** 2-column grid for charts
- **Mobile:** Single column stacking
- **Filter panel:** 5 columns on desktop, stacks on mobile

### Color Coding

- **Income** - Green (#10b981)
- **Expenses** - Red (#ef4444)
- **Net surplus** - Green
- **Net deficit** - Red
- **Chart colors** - 10-color palette for category pie chart

## Critical Implementation Notes

### 1. Transfer Exclusion

**IMPORTANT:** The `useAnalytics` hook **must** exclude transfers from all calculations to prevent double-counting.

**Database pattern:**

```sql
WHERE transfer_group_id IS NULL
```

This is handled by the `useAnalytics` hook, not the component.

### 2. Date Range Defaults

Default filter is **last 6 months** (not last month or year) - provides good balance of detail and overview.

### 3. Category Filtering

FilterPanel only shows **parent categories** for filtering. When a parent is selected, all child categories are included in the query automatically (handled by backend/hook).

### 4. Data Format Transformation

AnalyticsDashboard.tsx lines 79-94 transform analytics data to match chart component interfaces. **Do not modify chart data structure without updating these transformations.**

### 5. Color Generation

10-color palette cycles for category pie chart (lines 200-215). If >10 categories, colors repeat. This is acceptable for MVP.

## Common Use Cases

### 1. Monthly Spending Review

User wants to see spending for current month:

- Set start date: First day of current month
- Set end date: Today
- Type: Expense
- View: Category breakdown chart + top categories insight

### 2. Year-End Analysis

User wants annual financial summary:

- Set start date: Jan 1 of current year
- Set end date: Dec 31 of current year
- Type: All
- View: Year-over-year chart (if previous year data exists)

### 3. Account-Specific Analysis

User wants to analyze single account:

- Select specific account from dropdown
- Keep date range and other filters as desired
- View: All charts filtered to that account

### 4. Budget Performance Check

User wants to see budget adherence:

- Set date range: Current month (or custom period)
- Type: Expense
- View: Budget Progress chart + Category breakdown

## Performance Considerations

### Query Optimization

- **TanStack Query caching** - Accounts and categories cached for 5 minutes
- **Filter debouncing** - Not implemented; user must click "Apply Filters"
- **Chart rendering** - Charts handle data updates efficiently (React memoization in chart components)

### Data Volume

- **Large datasets** - useAnalytics hook should aggregate data in database, not client
- **Chart data points** - MonthlyChart handles up to 12 months of data points efficiently
- **Category breakdown** - Pie chart handles 10+ categories (may be visually cluttered beyond 15)

## Related Components

### Chart Components

- [src/components/charts/README.md](../charts/README.md) - Chart library (BudgetProgressChart, YearOverYearChart)
- [src/components/dashboard/README.md](../dashboard/README.md) - Dashboard charts (MonthlyChart, CategoryChart)

### UI Components

- [src/components/ui/](../ui/) - shadcn/ui primitives (Card, Select, Calendar, Button, etc.)

### Hooks

- [src/hooks/useAnalytics.tsx](../../hooks/README.md) - Analytics data fetching hook

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/components/README.md](../README.md) - Component architecture

### Architecture Decisions

- [/docs/initial plan/DECISIONS.md](../../../docs/initial%20plan/DECISIONS.md) - Key architectural decisions (#80: Budgets as reference targets)

### Database Schema

- [/docs/initial plan/DATABASE.md](../../../docs/initial%20plan/DATABASE.md) - Transfer exclusion pattern, query optimization
