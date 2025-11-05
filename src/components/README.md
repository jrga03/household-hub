# UI Components (`/src/components/`)

## Purpose

The components directory contains **all React UI components** for Household Hub, organized by feature area. Components use shadcn/ui as the base component library with Tailwind CSS for styling.

## Organization Philosophy

**Mixed Structure:** Feature-based subdirectories for complex features + standalone components for shared functionality.

**Benefits:**

- Related components grouped together (e.g., all budget components in `budgets/`)
- Shared components easily discoverable at root level
- Clear ownership and responsibilities

## Contents

### Feature Subdirectories

- **`analytics/`** (3 files) - Analytics dashboard components
  - `AnalyticsDashboard.tsx` - Main analytics page
  - `FilterPanel.tsx` - Date range and filter controls
  - `InsightsSection.tsx` - Spending insights and trends

- **`budgets/`** (5 files) - Budget management components
  - `BudgetCard.tsx` - Individual budget display card
  - `BudgetForm.tsx` - Create/edit budget form
  - `BudgetList.tsx` - List of all budgets
  - `BudgetProgress.tsx` - Progress indicator with percentage
  - `BudgetProgressBar.tsx` - Visual progress bar

- **`charts/`** (2 files) - Chart visualizations (Recharts)
  - `BudgetProgressChart.tsx` - Budget vs actual chart
  - `YearOverYearChart.tsx` - Year-over-year comparison

- **`dashboard/`** (4 files) - Dashboard page components
  - `CategoryChart.tsx` - Category breakdown chart
  - `MonthlyChart.tsx` - Monthly trends chart
  - `RecentTransactions.tsx` - Recent transaction list
  - `SummaryCards.tsx` - Summary metrics cards

- **`layout/`** (4 files) - Application layout and navigation
  - `AppLayout.tsx` - Main layout wrapper
  - `AppSidebar.tsx` - Desktop/tablet sidebar (excellent inline docs! ⭐)
  - `MobileNav.tsx` - Mobile bottom navigation
  - `QuickActionButton.tsx` - Floating action button

- **`transfers/`** (2 files) - Account transfer UI
  - `TransferForm.tsx` - Create transfer between accounts
  - `TransferList.tsx` - Display transfers

- **`ui/`** (30 files) - shadcn/ui component library
  - Base components: Button, Input, Label, etc.
  - Form components: Form, Select, Textarea, etc.
  - Overlay components: Dialog, Sheet, Popover, etc.
  - Data components: Table, Calendar, DatePicker, etc.
  - Custom: ColorPicker, CurrencyInput, IconPicker, etc.

### Standalone Components (Root Level)

**Account Components:**

- `AccountBalance.tsx` - Account balance display
- `AccountBalanceCard.tsx` - Account balance card
- `AccountFormDialog.tsx` - Create/edit account dialog

**Transaction Components:**

- `TransactionFormDialog.tsx` - Create/edit transaction dialog
- `TransactionList.tsx` - Transaction list with virtualization
- `TransactionFilters.tsx` - Transaction filter controls

**Category Components:**

- `CategoryFormDialog.tsx` - Create/edit category dialog
- `CategorySelector.tsx` - Category picker (hierarchical)
- `CategoryTotalCard.tsx` - Category spending total
- `CategoryTotalsGroup.tsx` - Grouped category totals

**Sync & Offline Components:**

- `SyncIndicator.tsx` - Global sync status indicator
- `SyncButton.tsx` - Manual sync trigger
- `SyncStatus.tsx` - Detailed sync status
- `SyncIssuesPanel.tsx` - Conflict resolution panel
- `SyncIssueItem.tsx` - Individual sync issue
- `OfflineBanner.tsx` - Offline mode banner
- `OfflineIndicator.tsx` - Offline status indicator
- `CompactionMonitor.tsx` - Event compaction monitoring
- `ConflictIndicator.tsx` - Conflict indicator badge

**PWA Components:**

- `InstallPrompt.tsx` - PWA install prompt
- `UpdatePrompt.tsx` - Service worker update prompt
- `StorageWarning.tsx` - Storage quota warning
- `NotificationSettings.tsx` - Push notification settings

**Import/Export Components:**

- `ExportButton.tsx` - CSV/JSON export button
- `ColumnMapper.tsx` - CSV column mapping UI
- `DuplicateResolver.tsx` - Duplicate detection UI

**Auth Components:**

- `AuthProvider.tsx` - Authentication context provider
- `LoginForm.tsx` - Login form
- `SignupForm.tsx` - Signup form

**Utility Components:**

- `Header.tsx` - Page header component
- `LoadingScreen.tsx` - Full-screen loading state
- `MonthSelector.tsx` - Month picker control

## Key Patterns

### Component Naming

- **PascalCase:** All components use PascalCase (e.g., `AccountFormDialog.tsx`)
- **Descriptive:** Names describe purpose (e.g., `CategorySelector` not `Picker`)
- **Dialog suffix:** Dialogs/modals end with `Dialog` (e.g., `TransactionFormDialog`)
- **Form suffix:** Forms end with `Form` (e.g., `BudgetForm`, `TransferForm`)

### shadcn/ui Integration

All base UI components are from shadcn/ui library:

**Location:** `components/ui/`

**How to Add:**

```bash
npx shadcn-ui add button
npx shadcn-ui add dialog
npx shadcn-ui add form
```

**Customization:**

- Components are copied into project (not installed from npm)
- Customize by editing files directly
- Use Tailwind classes for styling

**Documentation:** https://ui.shadcn.com

### Form Components

Forms use **React Hook Form** + **Zod** for validation:

**Pattern:**

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";

const schema = z.object({
  amount: z.number().min(0),
  description: z.string().min(1),
});

function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data) => {
    // Handle form submission
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Form fields */}
      </form>
    </Form>
  );
}
```

### Data Fetching in Components

Components use **custom hooks** for data fetching, not direct queries:

**Pattern:**

```typescript
import { useOfflineTransactions } from "@/hooks/useOfflineTransactions";

function TransactionList() {
  const { data: transactions, isLoading } = useOfflineTransactions();

  if (isLoading) return <LoadingScreen />;

  return (
    <div>
      {transactions.map(txn => (
        <TransactionItem key={txn.id} transaction={txn} />
      ))}
    </div>
  );
}
```

### Large Lists with Virtualization

Use **TanStack Table + TanStack Virtual** for 10k+ items:

**Pattern:**

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";
import { useReactTable } from "@tanstack/react-table";

// See TransactionList.tsx for complete example
```

## Common Development Tasks

### Creating a New Component

1. **Decide location:**
   - Feature-specific? → `components/[feature]/MyComponent.tsx`
   - Shared/reusable? → `components/MyComponent.tsx`

2. **Create file:**

   ```typescript
   export function MyComponent() {
     return <div>My Component</div>;
   }
   ```

3. **Import in parent:**
   ```typescript
   import { MyComponent } from "@/components/MyComponent";
   // or
   import { MyComponent } from "@/components/budgets/MyComponent";
   ```

### Adding a shadcn/ui Component

1. **Check available components:** https://ui.shadcn.com/docs/components

2. **Add to project:**

   ```bash
   npx shadcn-ui add [component-name]
   ```

3. **Component appears in:** `src/components/ui/[component-name].tsx`

4. **Use in your components:**
   ```typescript
   import { Button } from "@/components/ui/button";
   ```

### Creating a Form Dialog

1. **Use Dialog + Form + shadcn/ui components**
2. **Define Zod schema** in `lib/validations/`
3. **Use React Hook Form** with zodResolver
4. **Handle submission** with offline operations
5. **See:** `TransactionFormDialog.tsx` or `AccountFormDialog.tsx` for examples

### Integrating with Routing

Components are used in routes:

**Example:**

```typescript
// In src/routes/transactions.tsx
import { TransactionList } from "@/components/TransactionList";

export function TransactionsPage() {
  return (
    <div>
      <h1>Transactions</h1>
      <TransactionList />
    </div>
  );
}
```

**See:** [../routes/README.md](../routes/README.md) for routing guide.

## Testing Components

### Unit Tests (Vitest + React Testing Library)

**Pattern:**

```typescript
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { MyComponent } from "./MyComponent";

test("renders component", () => {
  render(<MyComponent />);
  expect(screen.getByText("Hello")).toBeInTheDocument();
});
```

### E2E Tests (Playwright)

**Location:** `/tests/e2e/`

**Pattern:**

```typescript
test("transaction form submission", async ({ page }) => {
  await page.goto("/transactions");
  await page.click('[data-testid="add-transaction"]');
  await page.fill('[name="amount"]', "1500.50");
  await page.click('[type="submit"]');
  // Assert success
});
```

## Layout Architecture

### Desktop/Tablet (AppLayout + AppSidebar)

```
┌──────────────────────────────────────────┐
│  Header (optional)                       │
├──────┬───────────────────────────────────┤
│      │                                   │
│ Side │  Main Content Area                │
│ bar  │  (route component renders here)   │
│      │                                   │
│      │                                   │
└──────┴───────────────────────────────────┘
```

**Sidebar:**

- Collapsible to icon-only mode
- Active route highlighting
- Managed by `navStore`

### Mobile (AppLayout + MobileNav)

```
┌──────────────────────────────────────────┐
│  Header (optional)                       │
├──────────────────────────────────────────┤
│                                          │
│  Main Content Area (full width)          │
│  (route component renders here)          │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  Mobile Bottom Navigation                │
└──────────────────────────────────────────┘
```

**Mobile Nav:**

- Fixed to bottom
- Icon + label for each route
- Active route highlighting

## Styling Guidelines

### Tailwind CSS v4

All styling uses Tailwind utility classes:

**Responsive Design:**

```tsx
<div className="px-4 md:px-6 lg:px-8">{/* Padding scales with breakpoints */}</div>
```

**Dark Mode (if implemented):**

```tsx
<div className="bg-white dark:bg-gray-800">{/* Automatic dark mode support */}</div>
```

### Component Variants

Use `class-variance-authority` (CVA) for variant props:

**Pattern:**

```typescript
import { cva } from "class-variance-authority";

const buttonVariants = cva("rounded-md px-4 py-2", {
  variants: {
    variant: {
      primary: "bg-blue-600 text-white",
      secondary: "bg-gray-200 text-gray-900",
    },
  },
});
```

## Related Documentation

### Parent README

- [../README.md](../README.md) - Source code overview

### Related Directories

- [../routes/README.md](../routes/README.md) - Pages that use components
- [../hooks/README.md](../hooks/README.md) - Data fetching hooks used by components
- [../lib/README.md](../lib/README.md) - Business logic called by components

### External Resources

- [shadcn/ui](https://ui.shadcn.com) - Component library
- [Tailwind CSS](https://tailwindcss.com) - Styling framework
- [React Hook Form](https://react-hook-form.com) - Form handling
- [Recharts](https://recharts.org) - Chart library
- [TanStack Table](https://tanstack.com/table) - Data tables
- [TanStack Virtual](https://tanstack.com/virtual) - Virtualization

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference
- [/docs/initial plan/ARCHITECTURE.md](../../docs/initial%20plan/ARCHITECTURE.md) - System architecture
