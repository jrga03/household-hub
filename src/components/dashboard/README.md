# Dashboard Components (`/src/components/dashboard/`)

## Purpose

Main dashboard visualization components for the **home page financial overview**. Displays summary metrics, spending trends, category breakdowns, and recent activity using Recharts visualization library.

## Directory Contents

**4 component files** (14.0 KB total):

- **`SummaryCards.tsx`** (148 lines, 5.0K) - 4-card grid showing key financial metrics
- **CategoryChart.tsx`** (123 lines, 3.8K) - Interactive pie chart for spending by category
- **`RecentTransactions.tsx`** (85 lines, 2.9K) - List of recent transactions with details
- **`MonthlyChart.tsx`** (91 lines, 2.3K) - Line chart showing monthly income vs expenses trend

## Component Overview

### SummaryCards.tsx

**Purpose:** Display 4 high-level financial metrics at the top of the dashboard with month-over-month comparison.

**The 4 cards:**

1. **Total Income** (Green)
   - Icon: TrendingUp
   - Shows: Current month income in PHP
   - Change: % increase/decrease from previous month
   - Color: Green background, green icon

2. **Total Expenses** (Red)
   - Icon: TrendingDown
   - Shows: Current month expenses in PHP
   - Change: % increase/decrease from previous month
   - Color: Red background, red icon

3. **Net Amount** (Blue/Orange)
   - Icon: ArrowUpDown
   - Shows: Income minus expenses (net cash flow)
   - Subtext: Transaction count for the month
   - Color: Blue (surplus) or Orange (deficit) background

4. **Total Balance** (Purple)
   - Icon: Wallet
   - Shows: Sum of all account balances
   - Subtext: Number of accounts
   - Color: Purple background, purple icon

**Month-over-month calculation:**

Lines 19-31 calculate percentage change from previous month:

```
incomeChange = (currentIncome - previousIncome) / previousIncome * 100
expenseChange = (currentExpense - previousExpense) / previousExpense * 100
```

**Change indicator display:**

- **Positive income change:** Green "+X.X% from last month"
- **Negative income change:** Red "-X.X% from last month"
- **Positive expense change:** Red "+X.X% from last month" (expenses going up is bad)
- **Negative expense change:** Green "-X.X% from last month" (expenses going down is good)

**Props required:**

```typescript
summary: {
  totalIncomeCents: number;
  totalExpenseCents: number;
  netAmountCents: number;
  accountCount: number;
  totalBalanceCents: number;
  previousMonthIncomeCents: number;
  previousMonthExpenseCents: number;
  transactionCount: number;
}
```

**Responsive layout:**

- **Desktop (lg):** 4 columns (all cards in one row)
- **Tablet (md):** 2 columns (2 rows of 2 cards)
- **Mobile:** 1 column (4 rows stacked)

**Dark mode support:**

- All icon backgrounds have `dark:bg-{color}-900/20` variants
- Icon colors have `dark:text-{color}-400` variants

### CategoryChart.tsx

**Purpose:** Interactive pie chart showing spending distribution across categories with clickable navigation.

**Visual layout:**

```
┌─ Spending by Category ─────────────┐
│                                    │
│  [Pie Chart]      Legend           │
│     50%          ● Food    ₱5,000  │
│   ●                ● Transport      │
│      ●           ● Housing          │
│                  ...                │
│                  +3 more categories │
└────────────────────────────────────┘
```

**Two-panel layout:**

- **Left (50%):** Recharts PieChart with percentage labels
- **Right (50%):** Interactive legend showing top 5 categories with amounts

**Interactive features:**

1. **Clickable pie slices** (lines 86-87)
   - Click any slice → Navigate to /transactions filtered by that category
   - Cursor changes to pointer on hover

2. **Clickable legend items** (lines 103-105)
   - Click any category in legend → Navigate to /transactions
   - Hover effect: background highlight (hover:bg-accent)

**Navigation implementation** (lines 48-54):

```typescript
handleCategoryClick(categoryId) {
  navigate({
    to: "/transactions",
    search: { categoryId: categoryId }
  });
}
```

**Custom tooltip** (lines 29-43):

- Displays: Category name, formatted amount, percentage of total
- Styled as card with shadow

**Data format expected:**

```typescript
data: Array<{
  categoryId: string; // For navigation
  categoryName: string; // Display name
  color: string; // Hex color for slice
  amountCents: number; // Amount in cents
  percentOfTotal: number; // Pre-calculated percentage
}>;
```

**Legend behavior:**

- Shows **top 5 categories** only
- If >5 categories: Shows "+X more categories" message (lines 113-117)

**Empty state:**

- Message: "No spending data for this month"
- Still shows card with title

**Lines 82-85** - Pie slice labels show percentages (rounded to nearest whole number)

### RecentTransactions.tsx

**Purpose:** Display the 5-10 most recent transactions with quick access to full transaction list.

**Transaction display format:**

```
┌─ Recent Transactions ────────── [View All →] ─┐
│                                                │
│ ● Grocery shopping                   -₱1,500  │
│   Jan 15 • BDO Checking • Food        pending │
│                                                │
│ ● Salary deposit                    +₱25,000  │
│   Jan 14 • BDO Savings • Income       cleared │
│                                                │
│ ...                                            │
└────────────────────────────────────────────────┘
```

**Each transaction shows:**

- **Color dot** - Category color (left side)
- **Description** - Transaction description (bold)
- **Metadata** - Date • Account • Category (muted, small text)
- **Amount** - Formatted with +/- prefix (right side, color-coded)
- **Status** - "pending" or "cleared" below amount

**Color coding:**

- **Income:** Green text, "+" prefix
- **Expense:** Red text, "-" prefix
- **Hover:** Background highlight (hover:bg-accent)

**Header actions:**

- **"View All" button** (ghost variant) - Links to /transactions page
- Uses TanStack Router Link component

**Props required:**

```typescript
transactions: TransactionWithRelations[]
```

**TransactionWithRelations includes:**

- Base transaction fields (id, description, amount_cents, type, date, status)
- Related data: `account`, `category` (with color)

**Empty state:**

- Message: "No transactions yet"
- Centered in card

**Lines 50-63** - Metadata row with conditional rendering (only shows if account/category exist)

### MonthlyChart.tsx

**Purpose:** Line chart showing income and expenses trend over time (typically last 6 months).

**Visual elements:**

1. **Two lines:**
   - **Green line** - Income trend
   - **Red line** - Expense trend
   - Stroke width: 2px

2. **Grid:** Dashed cartesian grid (3-3 pattern)

3. **Axes:**
   - X-axis: Month labels (e.g., "Jan", "Feb")
   - Y-axis: PHP amounts with locale formatting

4. **Legend:** Automatic legend showing "Income" and "Expense"

**Data transformation** (lines 61-66):

Recharts Y-axis displays better with whole numbers, so cents are converted to pesos:

```typescript
income: incomeCents / 100,    // 150000 cents → 1500 pesos
expense: expenseCents / 100
```

**Custom tooltip** (lines 36-58):

- Shows month name
- Two rows: Income and Expense with color dots
- Amounts converted back to cents for formatting: `value * 100`

**Y-axis formatting** (line 75):

```typescript
tickFormatter={(value) => `₱${value.toLocaleString()}`}
```

Displays: ₱1,500 instead of 1500

**Data format expected:**

```typescript
data: Array<{
  month: string; // "Jan", "Feb", etc.
  incomeCents: number; // Income for that month
  expenseCents: number; // Expenses for that month
}>;
```

**Chart dimensions:**

- Width: 100% (responsive container)
- Height: 300px

**Empty state:** Not explicitly handled (assumes data always provided)

## Data Flow Architecture

### Dashboard Page Integration

```
Dashboard route (/routes/dashboard.tsx)
  ↓
Fetches summary data (hook or API)
  ↓
Passes data to 4 dashboard components:
  - SummaryCards (summary object)
  - CategoryChart (category breakdown array)
  - RecentTransactions (transaction array)
  - MonthlyChart (monthly trend array)
  ↓
Components render visualizations
```

### Category Click Navigation

```
User clicks category slice/legend
  ↓
handleCategoryClick(categoryId)
  ↓
TanStack Router navigate()
  ↓
/transactions page opens
  ↓
URL search param: ?categoryId=xxx
  ↓
Transaction list auto-filters
```

### Month-over-Month Calculation

```
Backend query fetches:
  - Current month totals
  - Previous month totals
  ↓
SummaryCards calculates % change
  ↓
Displays change indicator
```

## Integration Points

### Recharts Library

All charts use **Recharts** (recharts.org):

- **PieChart** - CategoryChart
- **LineChart** - MonthlyChart
- **ResponsiveContainer** - Auto-sizing
- **Tooltip** - Custom tooltips
- **Legend** - Auto-generated legends

**Installation:**

```bash
npm install recharts
```

**Common patterns:**

- `ResponsiveContainer` wraps all charts for responsiveness
- `CustomTooltip` components for styled hover info
- `formatPHP` used in all tooltip/label formatters

### Currency Utilities

**`formatPHP(cents)`** - Used in all components

- Location: `src/lib/currency.ts`
- Input: Integer cents
- Output: "₱X,XXX.XX" formatted string
- Usage: All amounts displayed to user

### TanStack Router

**`useNavigate` hook** - CategoryChart navigation

- Location: `@tanstack/react-router`
- Usage: Programmatic navigation with search params

**`Link` component** - RecentTransactions "View All" button

- Location: `@tanstack/react-router`
- Usage: Declarative navigation

### Type Definitions

**`TransactionWithRelations`** - RecentTransactions prop

- Location: `src/types/transactions.ts`
- Includes: Transaction + related account/category data

### Icons

**Lucide React** icons used:

- TrendingUp, TrendingDown - Income/Expense cards
- Wallet - Balance card
- ArrowUpDown - Net amount card
- ArrowRight - "View All" button

## Key Features

### 1. Month-over-Month Comparison

SummaryCards shows percentage change from previous month with:

- **Visual indicator:** +/-X.X%
- **Color coding:** Green (improvement) / Red (worsening)
- **Smart logic:** Expense increase = Red, Expense decrease = Green

**Lines 50-59** (Income) and **77-86** (Expenses) - Conditional rendering only shows change if absolute value > 0.01%

### 2. Interactive Navigation

CategoryChart allows drill-down into specific categories:

- Click pie slice → See all transactions for that category
- Click legend item → Same navigation
- Seamless UX for exploring spending patterns

### 3. Visual Consistency

All components use consistent:

- **Color scheme:** Green (income), Red (expenses), Blue/Purple/Orange (other)
- **Typography:** Monospace font (`font-mono`) for all amounts
- **Card styling:** shadcn/ui Card component throughout
- **Dark mode:** All colors have dark mode variants

### 4. Responsive Charts

All charts use `ResponsiveContainer`:

- Auto-adjusts to parent width
- Fixed heights (250px-300px) for consistency
- Mobile-friendly layouts

### 5. Empty State Handling

All components gracefully handle empty data:

- **SummaryCards:** Shows ₱0.00 with 0% change
- **CategoryChart:** "No spending data for this month"
- **RecentTransactions:** "No transactions yet"
- **MonthlyChart:** Would show empty axes (assumes data always provided)

## Common Use Cases

### 1. Dashboard Overview

User opens app and lands on dashboard:

1. SummaryCards show monthly financial snapshot
2. CategoryChart reveals spending distribution
3. MonthlyChart shows 6-month trend
4. RecentTransactions shows latest activity
5. All data loads simultaneously via parallel queries

### 2. Category Investigation

User notices high "Food" spending in CategoryChart:

1. Clicks "Food" slice in pie chart
2. Navigates to /transactions?categoryId=food-id
3. Sees all food-related transactions
4. Can drill into specific transaction details

### 3. Trend Analysis

User checks MonthlyChart:

1. Sees income stable (flat green line)
2. Notices expenses increasing (rising red line)
3. Can correlate with CategoryChart to find cause
4. May adjust budgets or spending habits

### 4. Quick Transaction Review

User checks RecentTransactions:

1. Sees last 5-10 transactions
2. Verifies recent purchases posted correctly
3. Notices pending status on today's transactions
4. Clicks "View All" for full transaction management

## UI/UX Patterns

### Responsive Grid Layout

**SummaryCards:**

- 4 columns on large screens (lg:grid-cols-4)
- 2 columns on tablets (md:grid-cols-2)
- 1 column on mobile

**CategoryChart:**

- Side-by-side pie + legend on desktop (md:flex-row)
- Stacked on mobile (flex-col)

### Color Semantics

| Color  | Meaning               | Usage                                          |
| ------ | --------------------- | ---------------------------------------------- |
| Green  | Positive, Income      | Income amounts, income increase                |
| Red    | Negative, Expense     | Expense amounts, expense increase, over budget |
| Blue   | Neutral, Net positive | Net surplus                                    |
| Orange | Warning, Net negative | Net deficit                                    |
| Purple | Informational         | Total balance                                  |

### Typography

**Amounts:**

- Font: Monospace (`font-mono`)
- Size: 2xl for large cards, sm for lists
- Weight: Bold or semibold

**Labels:**

- Color: Muted foreground
- Size: xs or sm
- Weight: Normal

### Interactive Feedback

**CategoryChart:**

- `cursor="pointer"` on pie slices
- `hover:bg-accent` on legend items
- Smooth transitions (`transition-colors`)

**RecentTransactions:**

- `hover:bg-accent` on transaction rows
- Border on all rows for clear separation

## Performance Considerations

### Chart Rendering

Recharts efficiently handles:

- Responsive resizing without re-fetching data
- Tooltip hover interactions
- Legend interactions

**Optimization tips:**

- Limit MonthlyChart to 12 data points maximum
- CategoryChart shows top 5 in legend (reduces DOM size)
- RecentTransactions typically limited to 5-10 items

### Data Volume

**SummaryCards:**

- Receives pre-aggregated data (fast)
- No client-side calculations except % change

**CategoryChart:**

- Data should be pre-aggregated by backend
- Client only renders, doesn't calculate totals

**MonthlyChart:**

- One-time conversion from cents to pesos (negligible)

### Lazy Loading

Dashboard components don't implement lazy loading (all lightweight), but parent route could:

- Defer chart components until fold
- Show SummaryCards first
- Stream in charts as data arrives

## Critical Implementation Notes

### 1. Transfer Exclusion (CRITICAL)

All dashboard calculations **MUST exclude transfers** in backend queries:

```sql
WHERE transfer_group_id IS NULL
```

**Why:** Including transfers would:

- Double-count money (expense from one account, income to another)
- Inflate spending totals
- Corrupt budget vs actual calculations

**Where enforced:** Backend/hook queries, NOT in these components.

### 2. Currency Display Format

Always use `formatPHP(cents)` for amounts:

- **Never** display raw cents (150000 is meaningless to users)
- **Never** divide by 100 manually (formatPHP handles this)
- **Exception:** MonthlyChart divides by 100 for Y-axis scaling (lines 64-65), but tooltip converts back

### 3. Month-over-Month Edge Cases

Lines 19-31 check for `previousMonthIncomeCents > 0`:

- Prevents division by zero
- Returns 0% change if previous month was zero
- Doesn't show change indicator if absolute change < 0.01%

### 4. Category Color Consistency

CategoryChart uses `category.color` from database:

- Colors defined in categories table
- Must be valid hex colors (e.g., "#ef4444")
- Displayed as color dots and pie slices

### 5. Date Formatting

RecentTransactions uses `date-fns` format:

```typescript
format(new Date(transaction.date), "MMM d");
```

- Displays: "Jan 15" (abbreviated month + day)
- User timezone handled by Date constructor

## Related Components

### Chart Components

- [src/components/charts/README.md](../charts/README.md) - Additional chart types (BudgetProgressChart, YearOverYearChart)

### UI Components

- [src/components/ui/card.tsx](../ui/) - Card wrapper
- [src/components/ui/button.tsx](../ui/) - Button component

### Transaction Components

- [src/components/README.md](../README.md) - Full component list

### Analytics Components

- [src/components/analytics/README.md](../analytics/README.md) - Advanced analytics dashboard (uses MonthlyChart and CategoryChart)

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/components/README.md](../README.md) - Component architecture

### Database Schema

- [/docs/initial plan/DATABASE.md](../../../docs/initial%20plan/DATABASE.md) - Transfer exclusion pattern, query optimization

### Routing

- [/src/routes/dashboard.tsx](../../routes/README.md) - Dashboard route implementation

### Utilities

- [/src/lib/currency.ts](../../lib/README.md) - PHP currency formatting (formatPHP)
