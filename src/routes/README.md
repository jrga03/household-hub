# Routes (`/src/routes/`)

## Purpose

The routes directory contains **TanStack Router page components** that define the application's navigation structure. TanStack Router provides type-safe, file-based routing with automatic code splitting and prefetching.

## Important: TanStack Router (NOT React Router)

**⚠️ This project uses TanStack Router, NOT react-router-dom!**

**Key Differences:**

- File-based routing (like Next.js)
- Fully type-safe (autocomplete for routes)
- Automatic route tree generation
- Built-in search params validation
- Better TypeScript integration

**Documentation:** https://tanstack.com/router

## Route Structure

### Root Route

- **`__root.tsx`** - Root route wrapper
  - Wraps all routes with common layout
  - Provides global error boundary
  - Renders `<Outlet />` for child routes

### Public Routes (No Auth Required)

- **`login.tsx`** - Login page
- **`signup.tsx`** - Signup page

### Protected Routes (Auth Required)

- **`index.tsx`** - Home page (redirects to dashboard)
- **`dashboard.tsx`** - Main dashboard page
- **`transactions.tsx`** - Transactions list page
- **`accounts.tsx`** - Accounts management page
- **`accounts/$accountId.tsx`** - Account detail page (dynamic route)
- **`categories.tsx`** - Categories management page
- **`budgets/index.tsx`** - Budgets list page
- **`analytics/index.tsx`** - Analytics dashboard page
- **`transfers.tsx`** - Transfers page
- **`import.tsx`** - CSV import page
- **`settings.tsx`** - Settings page
- **`test-device.tsx`** - Device testing page (dev only)

### Nested Routes

**Budgets:**

- `budgets/` - Parent directory
  - `index.tsx` - List view (`/budgets`)

**Analytics:**

- `analytics/` - Parent directory
  - `index.tsx` - Analytics dashboard (`/analytics`)

**Accounts:**

- `accounts/` - Parent directory
  - `$accountId.tsx` - Account detail (dynamic param: `/accounts/123`)

## File-Based Routing

TanStack Router uses file structure to define routes:

**File → URL Mapping:**

```
__root.tsx              → / (root layout)
index.tsx               → / (home)
dashboard.tsx           → /dashboard
transactions.tsx        → /transactions
accounts.tsx            → /accounts
accounts/$accountId.tsx → /accounts/:accountId
budgets/index.tsx       → /budgets
analytics/index.tsx     → /analytics
```

**Dynamic Parameters:**

- `$` prefix denotes parameter: `$accountId` → `:accountId`
- Access in component: `const { accountId } = useParams()`

**Index Routes:**

- `index.tsx` renders at parent path
- Example: `budgets/index.tsx` → `/budgets`

## Route Tree Generation

**Auto-Generated File:** `src/routeTree.gen.ts`

**⚠️ DO NOT EDIT** - This file is automatically regenerated when route files change.

**Regeneration Triggers:**

- Adding new route file
- Removing route file
- Renaming route file
- Dev server restart

**Type Safety:**
Generated types enable autocomplete for:

- `<Link to="/dashboard" />` - Route paths
- `useNavigate()({ to: "/accounts/$accountId", params: { accountId: "123" } })` - Navigation
- Search params validation

## Route Component Pattern

**Basic Route:**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { MyPageComponent } from "@/components/MyPageComponent";

export const Route = createFileRoute("/my-route")({
  component: MyPageComponent,
});
```

**With Loader (Data Fetching):**

```typescript
export const Route = createFileRoute("/transactions")({
  loader: async () => {
    // Fetch data before rendering
    const transactions = await fetchTransactions();
    return { transactions };
  },
  component: TransactionsPage,
});

function TransactionsPage() {
  const { transactions } = Route.useLoaderData();
  // Render with data
}
```

**With Search Params:**

```typescript
import { z } from "zod";

const searchSchema = z.object({
  page: z.number().optional(),
  filter: z.string().optional(),
});

export const Route = createFileRoute("/transactions")({
  validateSearch: searchSchema,
  component: TransactionsPage,
});

function TransactionsPage() {
  const { page, filter } = Route.useSearch();
  // Use validated search params
}
```

**With Authentication:**

```typescript
export const Route = createFileRoute("/dashboard")({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardPage,
});
```

## Navigation

### Link Component

**Static Routes:**

```typescript
import { Link } from "@tanstack/react-router";

<Link to="/dashboard">Dashboard</Link>
<Link to="/transactions">Transactions</Link>
```

**Dynamic Routes:**

```typescript
<Link
  to="/accounts/$accountId"
  params={{ accountId: "123" }}
>
  View Account
</Link>
```

**With Search Params:**

```typescript
<Link
  to="/transactions"
  search={{ page: 2, filter: "expense" }}
>
  Expenses (Page 2)
</Link>
```

### Programmatic Navigation

**useNavigate Hook:**

```typescript
import { useNavigate } from "@tanstack/react-router";

function MyComponent() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({
      to: "/transactions",
      search: { page: 1 },
    });
  };
}
```

**Redirect:**

```typescript
import { redirect } from "@tanstack/react-router";

// In loader or beforeLoad
throw redirect({ to: "/login" });
```

## Route Protection

**Pattern:** Use `beforeLoad` to check authentication:

```typescript
export const Route = createFileRoute("/protected-route")({
  beforeLoad: async ({ context }) => {
    const user = await context.auth.getUser();
    if (!user) {
      throw redirect({ to: "/login" });
    }
  },
  component: ProtectedPage,
});
```

**Global Protection:** Implement in `__root.tsx` for all routes.

## Layout Patterns

### App Layout

Most routes use `AppLayout` component:

```typescript
import { AppLayout } from "@/components/layout/AppLayout";

function DashboardPage() {
  return (
    <AppLayout>
      {/* Page content */}
    </AppLayout>
  );
}
```

**AppLayout Provides:**

- Sidebar navigation (desktop/tablet)
- Mobile bottom navigation
- Responsive layout
- Header area

### Full-Screen Layouts

Some routes don't use AppLayout:

- `login.tsx` - Centered form
- `signup.tsx` - Centered form

## Common Development Tasks

### Adding a New Route

**1. Create route file:**

```typescript
// src/routes/reports.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <AppLayout>
      <h1>Reports</h1>
      {/* Page content */}
    </AppLayout>
  );
}
```

**2. Route is automatically available** at `/reports`

**3. Add navigation link** in `AppSidebar.tsx`:

```typescript
<SidebarMenuItem>
  <Link to="/reports">
    <Icon />
    Reports
  </Link>
</SidebarMenuItem>
```

**4. Verify route tree** regenerated:

```bash
# Check that routeTree.gen.ts includes new route
```

### Adding Dynamic Route

**Example: Category Detail**

**1. Create directory + file:**

```
routes/
  categories/
    $categoryId.tsx
```

**2. Define route:**

```typescript
// routes/categories/$categoryId.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/categories/$categoryId")({
  component: CategoryDetailPage,
});

function CategoryDetailPage() {
  const { categoryId } = Route.useParams();
  // Fetch and render category details
}
```

**3. Link to route:**

```typescript
<Link
  to="/categories/$categoryId"
  params={{ categoryId: category.id }}
>
  {category.name}
</Link>
```

### Adding Search Params

**1. Define schema:**

```typescript
import { z } from "zod";

const searchSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().optional(),
});
```

**2. Validate in route:**

```typescript
export const Route = createFileRoute("/transactions")({
  validateSearch: searchSchema,
  component: TransactionsPage,
});
```

**3. Use in component:**

```typescript
function TransactionsPage() {
  const { startDate, endDate, accountId } = Route.useSearch();
  // Use filters
}
```

**4. Update search params:**

```typescript
const navigate = useNavigate();

navigate({
  to: ".",
  search: (prev) => ({
    ...prev,
    accountId: "new-account-id",
  }),
});
```

## Testing Routes

### E2E Tests (Playwright)

**Pattern:**

```typescript
test("dashboard page loads", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("h1")).toContainText("Dashboard");
});

test("account detail navigation", async ({ page }) => {
  await page.goto("/accounts");
  await page.click('[data-account-id="123"]');
  await expect(page).toHaveURL("/accounts/123");
});
```

### Unit Tests (Component-Level)

**Pattern:**

```typescript
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { Route } from "./dashboard";

test("renders dashboard", () => {
  const history = createMemoryHistory({ initialEntries: ["/dashboard"] });
  render(
    <RouterProvider router={router} history={history} />
  );
  expect(screen.getByText("Dashboard")).toBeInTheDocument();
});
```

## Performance Considerations

**Code Splitting:**

- Each route is automatically code-split
- Only loaded when navigated to
- Reduces initial bundle size

**Prefetching:**

- TanStack Router prefetches on hover
- Faster navigation for users
- Configurable per route

**Lazy Loading:**

```typescript
export const Route = createFileRoute("/heavy-page")({
  component: lazy(() => import("./HeavyPage")),
});
```

## Related Documentation

### Parent README

- [../README.md](../README.md) - Source code overview

### Related Directories

- [../components/README.md](../components/README.md) - Components used in routes
- [../hooks/README.md](../hooks/README.md) - Hooks used in route components

### External Resources

- [TanStack Router](https://tanstack.com/router) - Official documentation
- [TanStack Router Type Safety](https://tanstack.com/router/latest/docs/framework/react/guide/type-safety) - TypeScript guide
- [File-Based Routing](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing) - Routing conventions

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference
- [/docs/initial plan/ARCHITECTURE.md](../../docs/initial%20plan/ARCHITECTURE.md) - System architecture
