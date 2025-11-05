# Chart Components (`/src/components/charts/`)

## Purpose

Analytics-specific chart components for **advanced financial visualizations**. These charts are used primarily in the Analytics Dashboard and provide specialized views beyond the basic dashboard charts.

## Directory Contents

**2 component files** (5.7 KB total):

- **`BudgetProgressChart.tsx`** (95 lines, 3.1K) - Multi-category budget progress with variance indicators
- **`YearOverYearChart.tsx`** (87 lines, 2.6K) - Year-over-year income/expense comparison

## Component Overview

### BudgetProgressChart.tsx

**Purpose:** Display multiple budget categories with progress bars, variance indicators, and over-budget alerts.

**Visual structure:**

```
┌─ Groceries ──────────────────── ⚠️ ─┐
│ [=========Progress 85%===========]  │
│ ₱4,250.00 of ₱5,000.00       85%   │
│ ↓ ₱750.00 under budget              │
└─────────────────────────────────────┘

┌─ Transportation ─────────────────────┐
│ [===========Progress 110%========]  │
│ ₱3,300.00 of ₱3,000.00      110%   │
│ ↑ ₱300.00 over budget               │
└─────────────────────────────────────┘
```

**Key features:**

1. **Three-tier color system:**
   - Green (< 80%): Safe zone
   - Yellow (80-100%): Warning zone
   - Red (> 100%): Over budget

2. **Variance indicators:**
   - TrendingDown icon (green): Under budget
   - TrendingUp icon (red): Over budget
   - Formatted variance amount

3. **Alert icons:**
   - AlertCircle icon (red): Shown for over-budget categories
   - Positioned in category header

4. **Progress bars:**
   - Capped at 100% visual (even if > 100% actual)
   - Dynamic color based on status
   - 2px height (h-2)

**Data format:**

```typescript
interface BudgetVariance {
  category: string; // Category name
  budgetAmount: number; // Target in cents
  actualAmount: number; // Actual spending in cents
  variance: number; // Difference (budget - actual)
  percentUsed: number; // (actual / budget) * 100
}
```

**Lines 32-38** - Color determination logic based on percentage thresholds

**Empty state:**

- Message: "No budgets set for this period"
- Rendered in Card with muted text

**Used by:** Analytics Dashboard

### YearOverYearChart.tsx

**Purpose:** Compare current year vs previous year income and expenses using Recharts BarChart.

**Visual layout:**

```
┌─ Bar Chart ──────────────────────────┐
│          Income    Expenses          │
│ Prev  [████████] [████████]          │
│ Curr  [██████████] [██████]          │
└──────────────────────────────────────┘

┌─ Percentage Change Summary ──────────┐
│ Income Change      Expense Change    │
│   +15.2%              -8.5%          │
│ ₱5,000.00 increase  ₱1,200 decrease  │
└──────────────────────────────────────┘
```

**Key features:**

1. **Grouped bar chart:**
   - Two bars per period (income, expenses)
   - Green bars (income): #10b981
   - Red bars (expenses): #ef4444
   - Cartesian grid (dashed)

2. **Percentage change summary:**
   - Two-column grid below chart
   - Income change (left), Expense change (right)
   - Color-coded percentages
   - Absolute change amounts

3. **Color logic:**
   - **Income increase** → Green (positive)
   - **Income decrease** → Red (negative)
   - **Expense increase** → Red (bad for budget)
   - **Expense decrease** → Green (good for budget)

**Data format:**

```typescript
interface YearOverYear {
  currentYear: {
    income: number; // cents
    expenses: number; // cents
  };
  previousYear: {
    income: number; // cents
    expenses: number; // cents
  };
  change: {
    income: number; // cents difference
    expenses: number; // cents difference
  };
  percentChange: {
    income: number; // percentage
    expenses: number; // percentage
  };
}
```

**Lines 25-36** - Data transformation: Converts cents to pesos for Recharts Y-axis

**Lines 56-83** - Percentage change summary cards with conditional coloring

**Used by:** Analytics Dashboard

## Chart Integration

### Recharts Library

**BudgetProgressChart:**

- Uses: Progress component (shadcn/ui)
- No Recharts (custom progress bars)

**YearOverYearChart:**

- Uses: BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
- ResponsiveContainer for auto-sizing

**Common pattern:**

- Height: 300px for charts
- Width: 100% (responsive)
- Tooltip formatter: Converts pesos back to PHP format

### Currency Utilities

**`formatPHP(cents)`** - Used in both components

- Converts integer cents to formatted PHP currency
- Example: 150000 → "₱1,500.00"

### shadcn/ui Components

**Card, CardHeader, CardTitle, CardContent:**

- Used in: BudgetProgressChart
- Provides consistent card styling

**Progress:**

- Used in: BudgetProgressChart
- Accepts `value` (0-100) and custom `indicatorClassName`

## Key Features

### 1. Budget Status Visualization

**BudgetProgressChart provides at-a-glance budget health:**

- Multiple categories in single view
- Immediate visual feedback (color)
- Variance indicators show magnitude

**User can quickly identify:**

- Which categories are over budget (red + alert icon)
- Which are approaching limit (yellow)
- Which are safe (green)

### 2. Year-over-Year Trends

**YearOverYearChart reveals long-term patterns:**

- Grouped bars enable direct comparison
- Percentage change quantifies growth/decline
- Absolute amounts show scale

**Use cases:**

- Annual financial review
- Long-term trend analysis
- Budget adjustment planning

### 3. Responsive Design

**Both charts adapt to container width:**

- ResponsiveContainer in YearOverYearChart
- Card stacking in BudgetProgressChart
- Mobile-friendly layouts

### 4. Empty State Handling

**BudgetProgressChart:**

- Shows helpful message when no budgets set
- Encourages user to create budgets

**YearOverYearChart:**

- Assumes data always provided (used in analytics context)
- Chart renders with zero values if no data

## Common Use Cases

### 1. Monthly Budget Review

User wants to see all budget progress:

1. Navigate to Analytics page
2. BudgetProgressChart shows all categories
3. Identify over-budget categories (red)
4. Review variance amounts
5. Adjust spending or budgets

### 2. Annual Financial Planning

User preparing annual budget:

1. View YearOverYearChart
2. Analyze income growth (+15%)
3. Note expense reduction (-8%)
4. Plan next year's budgets based on trends

### 3. Budget Health Check

User opens app daily:

1. Dashboard shows summary
2. Navigate to Analytics for detail
3. BudgetProgressChart shows current status
4. Yellow/red categories need attention

## UI/UX Patterns

### Color Semantics

| Color  | Meaning                      | Usage                             |
| ------ | ---------------------------- | --------------------------------- |
| Green  | Safe, Under budget, Positive | < 80% progress, income increase   |
| Yellow | Warning, Approaching limit   | 80-100% progress                  |
| Red    | Over budget, Negative        | > 100% progress, expense increase |

### Icon Usage

**BudgetProgressChart:**

- AlertCircle: Over-budget warning
- TrendingDown: Under budget (good)
- TrendingUp: Over budget (bad)

**YearOverYearChart:**

- No icons (relying on bar chart visualization)

### Typography

**Percentages:**

- Large (text-lg): Highlighted in summaries
- Bold (font-semibold): Emphasizes importance
- Color-coded: Green/red based on context

**Amounts:**

- Muted when not primary focus
- Bold red when over budget

## Performance Considerations

### BudgetProgressChart

**Rendering efficiency:**

- Simple card list (no complex chart library)
- Renders one card per budget category
- Typical: 8-12 categories (fast render)

**Optimization:**

- Progress bar capped at 100% (prevents overflow)
- Color calculation done once per category

### YearOverYearChart

**Recharts optimization:**

- Only 2 data points (previous, current)
- Simple bar chart (fast rendering)
- ResponsiveContainer handles resizing efficiently

**Data transformation:**

- One-time division by 100 (cents to pesos)
- Negligible performance impact

## Critical Implementation Notes

### 1. Progress Bar Capping

**BudgetProgressChart line 52:**

```typescript
value={Math.min(budget.percentUsed, 100)}
```

**Why capped?**

- Progress bars visually max out at 100%
- Prevents overflow/display issues
- Over-budget status shown via color and text

### 2. Cents to Pesos Conversion

**YearOverYearChart lines 28-29:**

```typescript
income: data.currentYear.income / 100,
expenses: data.currentYear.expenses / 100,
```

**Why convert?**

- Recharts Y-axis displays better with whole numbers
- "5000" more readable than "500000"
- Tooltip converts back with `formatPHP(value * 100)`

### 3. Expense Change Color Inversion

**YearOverYearChart line 73:**

```typescript
className={`... ${data.percentChange.expenses <= 0 ? "text-green-600" : "text-red-600"}`}
```

**Why inverted?**

- Expense increase = bad (red)
- Expense decrease = good (green)
- Opposite of income logic

### 4. Variance Sign Convention

**BudgetProgressChart lines 71-85:**

```typescript
{budget.variance >= 0 ? (
  <> {/* Under budget - positive variance */}
    <TrendingDown className="h-3 w-3 text-green-600" />
    <span className="text-green-600">
      {formatPHP(budget.variance)} under budget
    </span>
  </>
) : (
  <> {/* Over budget - negative variance */}
    <TrendingUp className="h-3 w-3 text-red-600" />
    <span className="text-red-600">
      {formatPHP(Math.abs(budget.variance))} over budget
    </span>
  </>
)}
```

**Variance calculation:**

- `variance = budgetAmount - actualAmount`
- Positive variance = under budget (good)
- Negative variance = over budget (bad)

**Always use `Math.abs()` for display** - Show magnitude, not sign

## Related Components

### Dashboard Charts

- [src/components/dashboard/MonthlyChart.tsx](../dashboard/README.md) - Monthly trend line chart
- [src/components/dashboard/CategoryChart.tsx](../dashboard/README.md) - Category pie chart

**Difference:**

- Dashboard charts: Quick overview, simpler
- Analytics charts: Detailed analysis, advanced features

### Budget Components

- [src/components/budgets/BudgetProgressBar.tsx](../budgets/README.md) - Individual budget progress (alternative implementation)
- [src/components/budgets/BudgetProgress.tsx](../budgets/README.md) - Simpler progress indicator

**Difference:**

- Budget components: Used in budget management page
- BudgetProgressChart: Used in analytics for multi-category view

### Analytics Components

- [src/components/analytics/README.md](../analytics/README.md) - Analytics dashboard that uses these charts

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/components/README.md](../README.md) - Component architecture

### Utilities

- [/src/lib/currency.ts](../../lib/README.md) - PHP currency formatting (formatPHP)

### Database

- [/docs/initial plan/DATABASE.md](../../../docs/initial%20plan/DATABASE.md) - Budget calculations, transfer exclusion

## Further Reading

- [Recharts Documentation](https://recharts.org/en-US/) - Chart library
- [shadcn/ui Progress](https://ui.shadcn.com/docs/components/progress) - Progress component
- [Financial Data Visualization](https://www.smashingmagazine.com/2017/03/understanding-data-visualization/) - Best practices
