# Budget Components (`/src/components/budgets/`)

## Purpose

Budget management UI components for creating, editing, and visualizing monthly spending targets. Implements the **budgets as reference targets** pattern (Decision #80) where budgets are aspirational goals, not balances that roll over.

## Directory Contents

**5 component files** (11.8 KB total):

- **`BudgetCard.tsx`** (44 lines, 1.4K) - Individual budget card with edit/delete actions
- **`BudgetForm.tsx`** (139 lines, 4.0K) - Dialog form for creating/editing budgets
- **`BudgetList.tsx`** (52 lines, 1.7K) - Budget list grouped by parent category
- **`BudgetProgress.tsx`** (59 lines, 1.6K) - Simple progress indicator
- **`BudgetProgressBar.tsx`** (101 lines, 3.1K) - Detailed progress bar with status badges

## Component Overview

### BudgetCard.tsx

**Purpose:** Displays a single budget with category, progress visualization, and action buttons.

**Visual structure:**

```
┌─────────────────────────────────────┐
│ ● Category Name      [✎] [🗑]       │
│                                     │
│ [========Progress Bar========]     │
│ ₱X,XXX.XX spent  of  ₱X,XXX.XX     │
│ XX% used • ₱X,XXX.XX remaining     │
└─────────────────────────────────────┘
```

**Key elements:**

- **Color dot** - Category visual identifier (matches parent category color)
- **Category name** - Budget category display
- **Edit button** - Opens BudgetForm for editing
- **Delete button** - Triggers deletion (red icon)
- **BudgetProgress** - Embedded progress visualization

**Props:**

- `budget: Budget` - Budget data with category name, color, amounts, percentage
- `onEdit: (budget: Budget) => void` - Edit callback
- `onDelete: (budgetId: string) => void` - Delete callback

**Data expectations:**

```typescript
Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;      // Hex color for visual identifier
  budgetAmountCents: number;  // Target amount
  actualSpentCents: number;   // Actual spending (calculated)
  percentUsed: number;        // actualSpent / budget * 100
  isOverBudget: boolean;      // actualSpent > budget
}
```

### BudgetForm.tsx

**Purpose:** Dialog form for creating new budgets or editing existing budget amounts (not categories).

**Form fields:**

1. **Category** (CategorySelector)
   - **Create mode:** Dropdown of all categories
   - **Edit mode:** Disabled (line 100 - category cannot be changed)
   - Validation: Required

2. **Budget Amount** (Input with PHP prefix)
   - Text input with "₱" prefix symbol
   - Accepts formatted or raw numbers (e.g., "1,500.00" or "1500")
   - Validation: Between ₱0.01 and ₱9,999,999.99
   - Uses `parsePHP` to convert to cents

**Validation rules:**

- Category required
- Amount required
- Amount > 0 and <= 999,999,999 cents (₱9,999,999.99)
- Valid PHP currency format

**Lines 55-78** - `handleSubmit` logic:

1. Parse amount string to cents using `parsePHP`
2. Validate amount range
3. Call parent `onSubmit` with `{ categoryId, amountCents }`
4. Reset form and close dialog

**Lines 46-53** - Form reset on dialog close to clear previous values

**Important constraint:** Category is **immutable** when editing. To change a budget's category, user must delete and recreate.

**Rationale:** Prevents accidental category changes and maintains budget history integrity.

### BudgetList.tsx

**Purpose:** Displays budgets grouped by parent category with group totals.

**Grouping structure:**

```
┌─ Food (Parent Category) ────────────┐
│ ₱5,000.00 of ₱8,000.00              │  ← Group total
├─────────────────────────────────────┤
│ [Groceries Budget Card]             │
│ [Dining Out Budget Card]            │
└─────────────────────────────────────┘

┌─ Transportation ─────────────────────┐
│ ₱2,500.00 of ₱3,000.00              │
├─────────────────────────────────────┤
│ [Gas Budget Card]                   │
│ [Public Transit Budget Card]        │
└─────────────────────────────────────┘
```

**Data structure expected:**

```typescript
BudgetGroup {
  parentName: string;         // Parent category name
  parentColor: string;        // Parent category color (hex)
  totalBudgetCents: number;   // Sum of all child budgets
  totalSpentCents: number;    // Sum of all child actual spending
  budgets: Budget[];          // Array of child category budgets
}
```

**Visual hierarchy:**

- **Parent header** - Muted background with color indicator and group totals
- **Budget cards** - 2-column grid on desktop (md:grid-cols-2), single column on mobile

**Empty state:**

- Message: "No budgets for this month"
- CTA: "Click 'Add Budget' to create one"

**Lines 28-39** - Parent category header with aggregate spending vs budget

### BudgetProgress.tsx

**Purpose:** Simple progress visualization with color-coded status (used in BudgetCard).

**Status colors:**

| Status  | Percentage | Color  | Indicator      |
| ------- | ---------- | ------ | -------------- |
| Safe    | < 80%      | Green  | No warning     |
| Warning | 80-100%    | Yellow | High usage     |
| Over    | > 100%     | Red    | ⚠️ Over budget |

**Visual elements:**

1. **Progress bar** - shadcn/ui Progress component
   - Height: 12px (h-3)
   - Value capped at 100% even if over budget
   - Color changes based on status

2. **Spending stats**
   - Left: "₱X,XXX.XX spent" (color-coded)
   - Right: "of ₱X,XXX.XX" (muted)

3. **Details line**
   - **Under/at budget:** "XX.X% used • ₱X,XXX.XX remaining"
   - **Over budget:** "⚠️ Over budget by ₱X,XXX.XX"

**Lines 18-22** - `getProgressColor()` - Determines progress bar color

**Lines 24-28** - `getTextColor()` - Determines text color for amounts

### BudgetProgressBar.tsx

**Purpose:** Detailed progress bar with status badges and dark mode support (alternative to BudgetProgress).

**Excellent inline documentation:** Lines 1-13 contain comprehensive module docs explaining color scheme and visual status indicators.

**Enhanced features vs BudgetProgress:**

- **Status badge** - Percentage displayed in colored pill (top-right)
- **Dark mode support** - Tailwind dark: variants for all colors
- **Category name display** - Shows category in component (vs externally)
- **Three-tier status system** - under (<80%), near (80-100%), over (>100%)

**Visual structure:**

```
Category Name                    [75%]  ← Status badge
[========Progress Bar=========]
₱7,500.00 of ₱10,000.00     ₱2,500.00 remaining
```

**Status badge colors:**

- **Under** - Green background, green text
- **Near** - Amber background, amber text
- **Over** - Red background, red text

**Lines 42-68** - Color mapping objects for status-based styling

**Dark mode considerations:**

- All colors have `dark:` variants
- Badge backgrounds: `dark:bg-{color}-900/20`
- Text colors: `dark:text-{color}-400`

**Difference from BudgetProgress:**

- BudgetProgress: Simpler, used in BudgetCard
- BudgetProgressBar: Richer, shows category name, badge, better dark mode

## Budget Data Flow

### 1. Budget Creation

```
User clicks "Add Budget" button
  ↓
BudgetForm dialog opens (create mode)
  ↓
User selects category and enters amount
  ↓
Clicks "Create"
  ↓
parsePHP converts amount to cents
  ↓
Validates amount range
  ↓
onSubmit({ categoryId, amountCents })
  ↓
Parent creates budget in database
  ↓
Dialog closes, budget appears in list
```

### 2. Budget Editing

```
User clicks edit button on BudgetCard
  ↓
BudgetForm dialog opens (edit mode)
  ↓
Form pre-fills with existing amount
  ↓
Category selector DISABLED (immutable)
  ↓
User modifies amount only
  ↓
onSubmit updates budget amount
```

### 3. Budget Calculation

```
Database query fetches:
  - Budget target amount (budgetAmountCents)
  - Actual spending (SUM of transactions WHERE categoryId)
    ⚠️ MUST exclude transfers (WHERE transfer_group_id IS NULL)
  ↓
Calculate percentUsed = (actual / target) * 100
  ↓
Determine isOverBudget = actual > target
  ↓
Return Budget object with calculated fields
  ↓
BudgetCard renders progress
```

### 4. Budget Grouping

```
Database/Hook returns BudgetGroup[] array
  ↓
Groups budgets by parent category
  ↓
Calculates parent totals:
  - totalBudgetCents = SUM(child.budgetAmountCents)
  - totalSpentCents = SUM(child.actualSpentCents)
  ↓
BudgetList renders parent headers + child cards
```

## Integration Points

### Currency Utilities

**`parsePHP(input: string): number`** - Convert user input to cents

- Location: `src/lib/currency.ts`
- Handles: "1,500.00", "1500", "1,500", etc.
- Returns: Integer cents (150000)
- Throws: Error on invalid format

**`formatPHP(cents: number): string`** - Display cents as formatted currency

- Location: `src/lib/currency.ts`
- Input: 150000 (cents)
- Output: "₱1,500.00"

### Type Definitions

**`Budget` type** - Budget with calculated fields

- Location: `src/lib/supabaseQueries.ts`
- Includes: id, categoryId, categoryName, categoryColor, amounts, percentUsed, isOverBudget

**`BudgetGroup` type** - Grouped budgets by parent category

- Location: `src/lib/supabaseQueries.ts`
- Includes: parentName, parentColor, totals, budgets array

### UI Components

**CategorySelector** - Category dropdown component

- Location: `src/components/ui/category-selector.tsx`
- Used in: BudgetForm for category selection
- Props: `value`, `onChange`, `disabled`

**shadcn/ui components:**

- Card, Dialog, Form, Input, Button - Standard UI primitives
- Progress - Progress bar with custom indicator color

### Validation

**React Hook Form + Zod** - Form validation framework

- Lines 22-25 in BudgetForm.tsx - Zod schema definition
- Validates: Category required, amount required and valid format

## Key Features

### 1. Visual Status Indicators

Three-tier color system provides instant budget health feedback:

- **Green** - Safe zone, spending under control
- **Yellow** - Warning zone, approaching limit
- **Red** - Over budget, immediate attention needed

### 2. Category Immutability

When editing budgets, **category cannot be changed** (BudgetForm.tsx line 100).

**Rationale:**

- Prevents accidental category reassignment
- Maintains clean budget history
- Forces deliberate action (delete + recreate) for category changes

**User experience:**

- Edit button modifies amount only
- To change category: Delete existing budget and create new one

### 3. Parent Category Grouping

Budgets displayed grouped by parent category with aggregate totals.

**Benefits:**

- Visual hierarchy matches category structure
- Easy comparison within category groups
- Group totals show overall category spending vs budget

### 4. Real-time Spending Calculation

Actual spending is **calculated dynamically** from transactions, not stored.

**Critical implementation:**

```sql
SELECT SUM(amount_cents)
FROM transactions
WHERE category_id = $1
  AND transfer_group_id IS NULL  -- ⚠️ MUST exclude transfers
  AND date >= $2 AND date <= $3
```

**Why exclude transfers:** Transfers are movement between accounts, not spending. Including transfers would double-count funds and inflate spending totals.

### 5. Budget as Reference Targets

Per Decision #80, budgets are **aspirational targets only**.

**What this means:**

- Budgets don't "carry over" unused amounts
- No rollover or balance tracking
- Each month starts fresh
- Actual spending always calculated from transactions

**User workflow:**

- Set monthly budget targets
- Track progress throughout month
- Can copy previous month's targets for consistency
- Actual vs budget calculated fresh each month

## Common Use Cases

### 1. Creating First Budget

User wants to set monthly grocery budget:

1. Click "Add Budget" on budgets page
2. Select "Groceries" category
3. Enter amount: "5,000"
4. Click "Create"
5. Budget appears in Food parent category group

### 2. Adjusting Budget Mid-Month

User realizes they need higher gas budget:

1. Click edit (✎) on "Gas" budget card
2. Change amount from "2,000" to "3,000"
3. Click "Update"
4. Progress recalculates immediately
5. Category remains "Gas" (immutable)

### 3. Monitoring Budget Status

User checks budget health:

- **Green cards** - Spending on track
- **Yellow cards** - Approaching limit (80%+)
- **Red cards with ⚠️** - Over budget, needs attention

### 4. Parent Category Overview

User wants to see total household spending:

- View parent category headers (e.g., "Food", "Transportation")
- See aggregate: "₱12,500.00 of ₱15,000.00"
- All child budgets grouped below

## Validation & Constraints

### Amount Validation

**Range:** ₱0.01 to ₱9,999,999.99

- Minimum: 1 cent (prevents zero budgets)
- Maximum: ~10 million PHP (MAX_AMOUNT_CENTS constant line 20)

**Format:** Flexible input handling

- Accepts: "1500", "1,500", "1,500.00"
- Rejects: Negative, letters, special chars (except comma/period)

### Category Validation

**Create mode:**

- Category required (cannot create budget without category)
- Dropdown shows all available categories

**Edit mode:**

- Category field disabled
- Cannot change category after creation

### Form Behavior

**Reset on close** (lines 46-53):

- Form clears when dialog closes
- Prevents stale data on next open
- Fresh state for create mode

**Validation messages:**

- "Category is required"
- "Amount is required"
- "Amount must be between ₱0.01 and ₱9,999,999.99"
- "Invalid amount format"

## UI/UX Patterns

### Responsive Design

**BudgetList:**

- **Desktop (md+):** 2-column grid for budget cards
- **Mobile:** Single column stack

**BudgetCard:**

- Flexbox layout adjusts to card width
- Actions (edit/delete) always top-right
- Progress stacks vertically

### Empty States

**No budgets:**

```
┌────────────────────────────────────┐
│                                    │
│   No budgets for this month        │
│   Click "Add Budget" to create one │
│                                    │
└────────────────────────────────────┘
```

### Color Consistency

**Category colors:**

- Dot in BudgetCard matches category color
- Dot in parent header matches parent category color
- Colors defined in database categories table

**Status colors:**

- Green: Safe, under 80%
- Yellow: Warning, 80-100%
- Red: Over budget, >100%
- Consistent across all progress components

### Action Buttons

**Edit button:**

- Ghost variant (subtle)
- Pencil icon
- Opens BudgetForm in edit mode

**Delete button:**

- Ghost variant
- Trash icon in red (#ef4444)
- Triggers confirmation (handled by parent)

## Performance Considerations

### Data Fetching

- Budgets fetched per month (not all-time)
- Actual spending calculated server-side (not client)
- Parent grouping done in query or hook (not component)

### Rendering Optimization

- BudgetCard is lightweight (44 lines)
- Progress bars use single Progress component
- Color calculations memoized in getters

### Real-time Updates

When transactions change:

1. TanStack Query invalidates budget queries
2. Budgets re-fetch with updated spending
3. Progress bars re-render with new percentages
4. Colors update based on new status

## Critical Implementation Notes

### 1. Transfer Exclusion (CRITICAL)

**ALL budget calculations MUST exclude transfers:**

```sql
WHERE transfer_group_id IS NULL
```

**Why:** Transfers are account-to-account movements, not spending. Including them would show:

- Transfer from checking to savings as "expense"
- This inflates spending totals incorrectly

**Where implemented:** Database query or useB budgets hook, NOT in components.

### 2. Category Immutability

Category selector disabled in edit mode (BudgetForm.tsx line 100):

```typescript
disabled={!!existingBudget}
```

**Do not remove this constraint** without updating budget history tracking.

### 3. Amount Stored as Cents

Always store budget amounts as integer cents:

- `budgetAmountCents: number` (NOT `budgetAmount: number`)
- Use `parsePHP` to convert user input
- Use `formatPHP` to display

### 4. Budgets are Monthly

Budgets are scoped to specific month (monthKey: "2024-01").

**NOT global or rolling:**

- Each month has independent budgets
- No automatic rollover
- Can copy previous month's targets (feature not in these components)

### 5. Progress Percentage Capped

Progress bar value capped at 100% even if over budget:

```typescript
value={Math.min(percentUsed, 100)}
```

**Reason:** Progress bars visually max out at 100%. Over-budget status shown via color and text message.

## Related Components

### Chart Components

- [src/components/charts/BudgetProgressChart.tsx](../charts/README.md) - Chart view of budget progress

### UI Components

- [src/components/ui/category-selector.tsx](../ui/) - Category dropdown
- [src/components/ui/progress.tsx](../ui/) - Progress bar primitive

### Hooks

- [src/hooks/useBudgets.tsx](../../hooks/README.md) - Budget data fetching hook

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/components/README.md](../README.md) - Component architecture

### Architecture Decisions

- [/docs/initial plan/DECISIONS.md](../../../docs/initial%20plan/DECISIONS.md) - #80: Budgets as reference targets (no rollover)

### Database Schema

- [/docs/initial plan/DATABASE.md](../../../docs/initial%20plan/DATABASE.md) - Budgets table schema, transfer exclusion pattern

### Utilities

- [/src/lib/currency.ts](../../lib/README.md) - PHP currency formatting (formatPHP, parsePHP)
