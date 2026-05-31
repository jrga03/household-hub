# Wide-Screen Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace per-route `container mx-auto max-w-7xl` wrappers with a shared `PageShell` primitive that supports five layout variants (`centered`, `rail`, `split`, `nav-content`, `triple`), then migrate Dashboard, Analytics, Settings, Accounts, and Transactions to make use of wide screens via right rails, master-detail panes, and a three-column layout for Transactions.

**Architecture:** One layout primitive in `src/components/layout/PageShell.tsx` owns widths, padding, and responsive collapse using Tailwind v4 container queries (not viewport media queries) on the page region. Pages opt in by passing a `variant` prop and composing slot children (`Main`, `LeftAside`, `RightAside`). Selected-item state for master-detail (Accounts, Transactions) lives in URL search params so it deep-links and survives offline reloads. Existing modal-based edit flows are preserved as the narrow-screen fallback rather than retired.

**Tech Stack:** React 19 · TypeScript 5.9 · Tailwind CSS v4 (`@container`, `@[width]:` variants) · TanStack Router (search params via `Route.useSearch`) · shadcn/ui · Vitest (logic tests) · Playwright (visual + E2E at multiple viewports).

**Reference design:** `docs/plans/2026-05-30-wide-screen-layout-design.md`

---

## Pre-flight

**Strongly recommended:** Run this plan in a dedicated git worktree so the multi-page migration is reviewable as a single branch.

```bash
git worktree add ../household-hub-wide-layout -b feat/wide-screen-layout
cd ../household-hub-wide-layout
```

If you choose not to, just create the branch in-place: `git checkout -b feat/wide-screen-layout`.

**Conventions used throughout this plan:**

- File paths are absolute from repo root unless prefixed with `~/` (your fork path).
- Each task ends with a `git commit`. Do not batch commits across tasks — keeping them small means each commit is reviewable in isolation and easily revertible.
- "Verify" steps include the exact command and the exact expected output. If output doesn't match, stop and investigate before continuing.
- Container query breakpoints used across the plan:
  - `@xl` → 36rem / 576px
  - `@3xl` → 48rem / 768px
  - `@5xl` → 64rem / 1024px
  - `@7xl` → 80rem / 1280px
  - Custom: `1100px` (mid-breakpoint), `1500px` (wide-breakpoint) — declared in Tailwind config below.

---

## Task 1: Set up container query breakpoints in Tailwind

**Files:**

- Modify: `src/index.css` (Tailwind v4 uses CSS-first config via `@theme`)

**Step 1: Read current index.css to find the `@theme` block**

```bash
grep -n "@theme\|@import" src/index.css | head -20
```

Expected output: lines showing the Tailwind import (`@import "tailwindcss"`) and any existing `@theme` block.

**Step 2: Add custom container query breakpoints to `@theme`**

If a `@theme` block exists, append into it. Otherwise add one after the `@import "tailwindcss";` line.

```css
@theme {
  /* Custom container breakpoints for PageShell layout system.
     See docs/plans/2026-05-30-wide-screen-layout-design.md */
  --container-mid: 1100px;
  --container-wide: 1500px;
}
```

This makes `@[1100px]:` and `@[1500px]:` available as Tailwind container query variants throughout the codebase. (Tailwind v4 supports arbitrary container-query widths inline; the named tokens above are documentation aids — keep both forms working.)

**Step 3: Verify the dev server still starts**

```bash
npm run dev
```

Expected: server starts on port 3000 with no Tailwind warnings. Kill it (`Ctrl-C`) once you see "ready in NNNms".

**Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(layout): add custom container breakpoints for PageShell"
```

---

## Task 2: Create the `PageShell` primitive

**Files:**

- Create: `src/components/layout/PageShell.tsx`
- Create: `src/components/layout/PageShell.test.tsx`

**Step 1: Create the test file first (defines the public API)**

```tsx
// src/components/layout/PageShell.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageShell } from "./PageShell";

describe("PageShell", () => {
  it("renders main slot for centered variant", () => {
    render(
      <PageShell variant="centered">
        <PageShell.Main>main content</PageShell.Main>
      </PageShell>
    );
    expect(screen.getByText("main content")).toBeInTheDocument();
  });

  it("renders main and right aside for rail variant", () => {
    render(
      <PageShell variant="rail">
        <PageShell.Main>main</PageShell.Main>
        <PageShell.RightAside>rail</PageShell.RightAside>
      </PageShell>
    );
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("rail")).toBeInTheDocument();
  });

  it("renders all three slots for triple variant", () => {
    render(
      <PageShell variant="triple">
        <PageShell.LeftAside>filters</PageShell.LeftAside>
        <PageShell.Main>list</PageShell.Main>
        <PageShell.RightAside>detail</PageShell.RightAside>
      </PageShell>
    );
    expect(screen.getByText("filters")).toBeInTheDocument();
    expect(screen.getByText("list")).toBeInTheDocument();
    expect(screen.getByText("detail")).toBeInTheDocument();
  });

  it("applies @container class so children can use container query variants", () => {
    const { container } = render(
      <PageShell variant="rail">
        <PageShell.Main>main</PageShell.Main>
      </PageShell>
    );
    // The outermost wrapper must declare a container so @[1500px]: works inside.
    expect(container.firstChild).toHaveClass("@container");
  });
});
```

**Step 2: Install React Testing Library if not present**

```bash
npm ls @testing-library/react @testing-library/jest-dom 2>&1 | head
```

If "(empty)" or "missing", install:

```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/dom
```

Then add to `src/test/setup.ts` at the top:

```ts
import "@testing-library/jest-dom";
```

**Step 3: Run the test — should FAIL (component doesn't exist)**

```bash
npx vitest run src/components/layout/PageShell.test.tsx
```

Expected: FAIL, "Cannot find module './PageShell'" or similar.

**Step 4: Create `PageShell.tsx`**

```tsx
// src/components/layout/PageShell.tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Variant = "centered" | "rail" | "split" | "nav-content" | "triple";

interface PageShellProps {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

interface SlotProps {
  className?: string;
  children: ReactNode;
}

function Main({ className, children }: SlotProps) {
  return (
    <div data-slot="main" className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}

function LeftAside({ className, children }: SlotProps) {
  return (
    <aside data-slot="left-aside" className={cn("min-w-0", className)}>
      {children}
    </aside>
  );
}

function RightAside({ className, children }: SlotProps) {
  return (
    <aside data-slot="right-aside" className={cn("min-w-0", className)}>
      {children}
    </aside>
  );
}

/**
 * PageShell — layout primitive used by every page.
 *
 * Variants:
 *   - centered: single column, max-w-7xl. Default.
 *   - rail: main + right rail. Rail collapses below the main on narrow widths.
 *   - split: master-detail. Aside is the detail pane; collapses to main-only on narrow.
 *   - nav-content: left section nav + main content. Nav becomes horizontal tabs on narrow.
 *   - triple: left aside + main + right aside (Transactions only). Collapses progressively.
 *
 * Uses container queries (`@container`) so layouts react to actual page width,
 * not viewport width (the global sidebar can collapse and shift content width).
 *
 * See docs/plans/2026-05-30-wide-screen-layout-design.md for the full design.
 */
export function PageShell({ variant = "centered", className, children }: PageShellProps) {
  return (
    <div
      data-variant={variant}
      className={cn(
        "@container",
        // Inner layout grid depends on variant. Children render via data-slot.
        variant === "centered" && "mx-auto w-full max-w-7xl px-4 py-8",
        variant === "rail" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[1100px]:max-w-none @[1100px]:grid-cols-[1fr_320px] @[1500px]:grid-cols-[1fr_380px]",
        variant === "split" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[1100px]:max-w-none @[1100px]:grid-cols-2 @[1500px]:grid-cols-[55fr_45fr]",
        variant === "nav-content" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[900px]:grid-cols-[200px_1fr] @[1500px]:grid-cols-[240px_1fr]",
        variant === "triple" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[1100px]:max-w-none @[1100px]:grid-cols-[240px_1fr] @[1500px]:grid-cols-[260px_1fr_480px]",
        className
      )}
    >
      {children}
    </div>
  );
}

PageShell.Main = Main;
PageShell.LeftAside = LeftAside;
PageShell.RightAside = RightAside;
```

**Step 5: Re-run the test — should PASS**

```bash
npx vitest run src/components/layout/PageShell.test.tsx
```

Expected: 4 tests pass.

**Step 6: Commit**

```bash
git add src/components/layout/PageShell.tsx src/components/layout/PageShell.test.tsx src/test/setup.ts package.json package-lock.json
git commit -m "feat(layout): add PageShell primitive with variant-based grid"
```

---

## Task 3: Add Playwright baseline screenshots at multiple viewports

**Purpose:** Catch unintended visual regressions during the page-by-page migration. Take baseline screenshots of every target page at three widths _before_ any visual change.

**Files:**

- Create: `tests/e2e/layout-baseline.spec.ts`
- Create: `tests/e2e/fixtures/viewports.ts`

**Step 1: Create viewport fixture**

```ts
// tests/e2e/fixtures/viewports.ts
export const VIEWPORTS = {
  laptop: { width: 1366, height: 768 }, // narrow: < 1500
  desktop: { width: 1920, height: 1080 }, // mid: 1100-1500 content width
  ultrawide: { width: 2560, height: 1440 }, // wide: >= 1500 content width
} as const;
```

**Step 2: Create the baseline spec**

```ts
// tests/e2e/layout-baseline.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";
import { VIEWPORTS } from "./fixtures/viewports";

const ROUTES = [
  { path: "/", name: "dashboard" },
  { path: "/transactions", name: "transactions" },
  { path: "/analytics", name: "analytics" },
  { path: "/accounts", name: "accounts" },
  { path: "/settings", name: "settings" },
];

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  test.describe(`Layout baselines — ${vpName} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: vp });

    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    for (const route of ROUTES) {
      test(`${route.name} renders`, async ({ page }) => {
        await page.goto(route.path);
        // Wait for primary heading so we know hydration is done.
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page).toHaveScreenshot(`${route.name}-${vpName}.png`, {
          fullPage: true,
          // Mask volatile elements (sync indicator, dates).
          mask: [page.locator("[data-testid='sync-status']")],
          maxDiffPixelRatio: 0.02,
        });
      });
    }
  });
}
```

**Step 3: Capture baselines**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --update-snapshots --project=chromium
```

Expected: 15 screenshots written under `tests/e2e/layout-baseline.spec.ts-snapshots/`.

**Step 4: Run once more to confirm stability**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --project=chromium
```

Expected: all 15 tests PASS with no diffs.

**Step 5: Commit**

```bash
git add tests/e2e/layout-baseline.spec.ts tests/e2e/fixtures/viewports.ts tests/e2e/layout-baseline.spec.ts-snapshots/
git commit -m "test(layout): add visual baselines for layout migration"
```

---

## Task 4: Migrate Dashboard to `PageShell variant="centered"` (no visual change)

**Purpose:** Sanity-check the primitive on the simplest page. The screenshot baseline must not move.

**Files:**

- Modify: `src/routes/index.tsx`

**Step 1: Read the current dashboard route**

Reference: `src/routes/index.tsx:52-83` (the `return` block).

**Step 2: Replace the wrapper**

Replace lines 52-83 with:

```tsx
return (
  <div className="bg-background">
    {/* Month Selector Bar */}
    <div className="border-b bg-background">
      <div className="container mx-auto max-w-7xl px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Financial overview</p>
          </div>
          <MonthSelector selectedMonth={selectedMonth} onChange={setSelectedMonth} />
        </div>
      </div>
    </div>

    <PageShell variant="centered">
      <PageShell.Main className="space-y-6">
        <SummaryCards summary={data.summary} />
        <div className="grid gap-6 lg:grid-cols-2">
          <MonthlyChart data={data.monthlyTrend} />
          <CategoryChart data={data.categoryBreakdown} />
        </div>
        <RecentTransactions transactions={data.recentTransactions} />
      </PageShell.Main>
    </PageShell>
  </div>
);
```

Add to imports at the top:

```tsx
import { PageShell } from "@/components/layout/PageShell";
```

Note: the top header bar (Month Selector + page title) is intentionally _not_ moved into `PageShell` because it spans the full content width as a sticky-looking bar. PageShell controls only the main scrollable region below it. This pattern repeats on the other pages.

**Step 3: Verify baseline screenshots still pass**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --grep "dashboard" --project=chromium
```

Expected: 3 tests PASS (laptop, desktop, ultrawide) with no diffs.

If any fail, the visual output drifted. Inspect the diff in `playwright-report/` and adjust until it matches.

**Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "refactor(dashboard): migrate to PageShell centered variant"
```

---

## Task 5: Migrate Transactions, Analytics, Accounts, Settings to `centered` (no visual change)

**Purpose:** Get all five pages onto `PageShell` before introducing variant changes. Each migration is a pure refactor.

**Files:**

- Modify: `src/routes/transactions.tsx`
- Modify: `src/routes/analytics.tsx`
- Modify: `src/routes/accounts.tsx`
- Modify: `src/routes/settings.tsx`

**Step 1: Transactions** — replace the `<main>` block at `src/routes/transactions.tsx:95-108`:

```tsx
<PageShell variant="centered">
  <PageShell.Main className="space-y-6">
    <TransactionFiltersComponent filters={search} onFiltersChange={updateFilters} />
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        {transactions?.length || 0} transaction{transactions?.length !== 1 ? "s" : ""}
      </div>
    </div>
    <TransactionList filters={debouncedFilters} onEdit={handleEdit} />
  </PageShell.Main>
</PageShell>
```

Add import:

```tsx
import { PageShell } from "@/components/layout/PageShell";
```

**Step 2: Analytics** — replace the `<main>` block at `src/routes/analytics.tsx:29-88`:

```tsx
<PageShell variant="centered">
  <PageShell.Main>
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {/* …existing TabsList and TabsContent blocks unchanged… */}
    </Tabs>
  </PageShell.Main>
</PageShell>
```

Add import.

**Step 3: Accounts** — replace the `<main>` block at `src/routes/accounts.tsx:85-126`:

```tsx
      <PageShell variant="centered">
        <PageShell.Main>
          {!accounts || accounts.length === 0 ? (
            /* …existing empty state… */
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* …existing card map… */}
            </div>
          )}
          <AccountFormDialog open={isFormOpen} onClose={…} editingId={editingId} />
        </PageShell.Main>
      </PageShell>
```

Add import.

**Step 4: Settings** — replace the `<main>` block at `src/routes/settings.tsx:87-256`:

```tsx
<PageShell variant="centered">
  <PageShell.Main className="space-y-6">
    {/* …all existing Card sections unchanged… */}
  </PageShell.Main>
</PageShell>
```

Add import.

**Step 5: Run all baseline screenshots**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --project=chromium
```

Expected: 15 tests PASS. If any fail, inspect, fix, re-run.

**Step 6: Commit**

```bash
git add src/routes/transactions.tsx src/routes/analytics.tsx src/routes/accounts.tsx src/routes/settings.tsx
git commit -m "refactor: migrate remaining pages to PageShell centered variant"
```

---

## Task 6: Apply `rail` variant to Dashboard

**Purpose:** First real visual change. Dashboard's "Spending by Category" donut and account balances list move to the right rail; main column gets KPI cards + Monthly Trend (full width) + Recent Transactions.

**Files:**

- Modify: `src/routes/index.tsx`
- Create: `src/components/dashboard/DashboardRail.tsx`
- Modify: `tests/e2e/layout-baseline.spec.ts-snapshots/dashboard-*.png` (regenerate)

**Step 1: Create the rail component**

```tsx
// src/components/dashboard/DashboardRail.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryChart } from "./CategoryChart";
import type { CategoryBreakdown } from "@/types/transactions"; // adjust to actual type

interface DashboardRailProps {
  categoryBreakdown: CategoryBreakdown[];
  // Add accounts/balances props later — start minimal.
}

export function DashboardRail({ categoryBreakdown }: DashboardRailProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Spending by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryChart data={categoryBreakdown} />
        </CardContent>
      </Card>
      {/* Account balances list and top-3 categories cards come in future passes.
          Keep this minimal so we ship the layout change without scope creep. */}
    </div>
  );
}
```

**Step 2: Update the dashboard route to use `rail`**

In `src/routes/index.tsx`, change the `PageShell` block:

```tsx
<PageShell variant="rail">
  <PageShell.Main className="space-y-6">
    <SummaryCards summary={data.summary} />
    <MonthlyChart data={data.monthlyTrend} />
    <RecentTransactions transactions={data.recentTransactions} />
  </PageShell.Main>
  <PageShell.RightAside>
    <DashboardRail categoryBreakdown={data.categoryBreakdown} />
  </PageShell.RightAside>
</PageShell>
```

Remove the old `lg:grid-cols-2` row that paired Monthly + Category charts side by side.

Add import:

```tsx
import { DashboardRail } from "@/components/dashboard/DashboardRail";
```

**Step 3: Visual check — dev server**

```bash
npm run dev
```

Open `http://localhost:3000/` and resize the browser window to test:

- 1366px wide → rail should be **below** main (collapsed).
- 1920px wide → rail visible on the right, ~320px wide.
- 2560px wide → rail visible on the right, ~380px wide.

Capture a screenshot for review.

**Step 4: Update the dashboard baseline screenshots (they will legitimately change)**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --grep "dashboard" --update-snapshots --project=chromium
```

**Step 5: Verify the _other_ pages have not regressed**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --project=chromium
```

Expected: 15 PASS. Dashboard tests pass against the new baselines; the other 12 pass against unchanged baselines.

**Step 6: Commit**

```bash
git add src/routes/index.tsx src/components/dashboard/DashboardRail.tsx tests/e2e/layout-baseline.spec.ts-snapshots/dashboard-*.png
git commit -m "feat(dashboard): use PageShell rail variant for wide-screen layout"
```

---

## Task 7: Apply `rail` variant to Analytics (Overview tab)

**Purpose:** Move the giant Filters card out of the Overview tab body and into a sticky right rail. The KPI grid and charts expand to fill the main column.

**Files:**

- Modify: `src/components/analytics/AnalyticsDashboard.tsx` (move filter UI out)
- Modify: `src/routes/analytics.tsx` (wrap Overview tab with rail)
- Create: `src/components/analytics/AnalyticsFilterRail.tsx`

**Step 1: Read the current Analytics structure**

```bash
sed -n '1,80p' src/components/analytics/AnalyticsDashboard.tsx
```

Identify the filter section (likely a Card containing date range, account, category, type selects).

**Step 2: Extract filter UI into `AnalyticsFilterRail.tsx`**

```tsx
// src/components/analytics/AnalyticsFilterRail.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsFilterRailProps {
  /* same props the inline filter form used — startDate, endDate, accountId, categoryId, type,
     onApply, onClear */
}

export function AnalyticsFilterRail(props: AnalyticsFilterRailProps) {
  return (
    <div className="space-y-6 @[1100px]:sticky @[1100px]:top-4">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Move the existing filter form here — date range, account select,
              category select, type select, Apply + Clear buttons. */}
        </CardContent>
      </Card>
    </div>
  );
}
```

The `sticky` only activates inside the container query, so it stays sticky on wide screens and scrolls normally on narrow ones (where the rail is below content anyway).

**Step 3: Wrap the Overview tab content with `rail`**

In `src/routes/analytics.tsx`, the existing structure is:

```tsx
<PageShell variant="centered">
  <PageShell.Main>
    <Tabs ...>
      <TabsList ...>...</TabsList>
      <TabsContent value="overview"><AnalyticsDashboard /></TabsContent>
      ...
    </Tabs>
  </PageShell.Main>
</PageShell>
```

`Tabs` is the container for all three tabs (Overview / By Category / Trends). Only Overview needs the rail. Two valid options:

- **A (simpler):** keep `variant="centered"` at the page level, and put the rail/grid _inside_ the Overview tab content.
- **B (cleaner):** split the route into per-tab PageShell instances. More code.

Use option A:

```tsx
<TabsContent value="overview" className="mt-0">
  <Suspense fallback={...}>
    <div className="@container">
      <div className="grid gap-6 @[1100px]:grid-cols-[1fr_320px] @[1500px]:grid-cols-[1fr_380px]">
        <AnalyticsDashboard /> {/* with filter form removed from inside */}
        <AnalyticsFilterRail {...filterProps} />
      </div>
    </div>
  </Suspense>
</TabsContent>
```

Filter state lives in the route component (lift it up from `AnalyticsDashboard` if it currently lives there).

**Step 4: Visual check**

```bash
npm run dev
```

Open `http://localhost:3000/analytics` and verify at 1366 / 1920 / 2560 widths.

**Step 5: Update Analytics baselines**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --grep "analytics" --update-snapshots --project=chromium
```

**Step 6: Verify no other-page regressions**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --project=chromium
```

Expected: 15 PASS.

**Step 7: Commit**

```bash
git add src/routes/analytics.tsx src/components/analytics/AnalyticsDashboard.tsx src/components/analytics/AnalyticsFilterRail.tsx tests/e2e/layout-baseline.spec.ts-snapshots/analytics-*.png
git commit -m "feat(analytics): move filter panel to sticky right rail on wide screens"
```

---

## Task 8: Apply `nav-content` variant to Settings

**Purpose:** Give Settings a left section nav so each section is one click away and the form column stays readable.

**Files:**

- Modify: `src/routes/settings.tsx`
- Create: `src/components/settings/SettingsNav.tsx`

**Step 1: Create the section nav**

```tsx
// src/components/settings/SettingsNav.tsx
import { cn } from "@/lib/utils";
import { Palette, Download, Database } from "lucide-react";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data-export", label: "Data Export", icon: Download },
  { id: "storage", label: "Storage", icon: Database },
] as const;

export function SettingsNav({ activeId }: { activeId?: string }) {
  return (
    <nav
      aria-label="Settings sections"
      className="
        @[900px]:sticky @[900px]:top-4 @[900px]:self-start
        flex gap-2 overflow-x-auto pb-2
        @[900px]:flex-col @[900px]:overflow-visible @[900px]:pb-0
      "
    >
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            activeId === id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </a>
      ))}
    </nav>
  );
}
```

The nav is a horizontal scroller below the `@[900px]` breakpoint, and a sticky vertical column above it. Anchor links handle navigation; we'll add scroll-spy in a later pass if needed.

**Step 2: Update Settings route to use `nav-content`**

```tsx
<PageShell variant="nav-content">
  <PageShell.LeftAside>
    <SettingsNav />
  </PageShell.LeftAside>
  <PageShell.Main className="space-y-6 mx-auto w-full max-w-2xl">
    <section id="appearance">{/* existing Appearance Card */}</section>
    <section id="data-export">{/* existing Data Export Card */}</section>
    <section id="storage">{/* existing Storage Management Card */}</section>
  </PageShell.Main>
</PageShell>
```

Add imports:

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { SettingsNav } from "@/components/settings/SettingsNav";
```

Note `max-w-2xl` on `PageShell.Main` — keeps the form/prose column readable even when the parent grid gives it a lot of space.

**Step 3: Visual check at all breakpoints**

```bash
npm run dev
```

Open `http://localhost:3000/settings`. Verify:

- < 900px content: nav is a horizontal pill row at the top.
- 900-1500px: nav is a 200px sticky column on the left.
- ≥ 1500px: nav is a 240px sticky column on the left; content is centered within its column at max-w-2xl.

Click each anchor link; it should jump to the section.

**Step 4: Update Settings baselines**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --grep "settings" --update-snapshots --project=chromium
```

**Step 5: Verify no other-page regressions**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --project=chromium
```

**Step 6: Commit**

```bash
git add src/routes/settings.tsx src/components/settings/SettingsNav.tsx tests/e2e/layout-baseline.spec.ts-snapshots/settings-*.png
git commit -m "feat(settings): add section nav with nav-content PageShell variant"
```

---

## Task 9: Add selected-item URL search param hook (foundation for split/triple)

**Purpose:** Master-detail (Accounts, Transactions) needs a selected-item ID that survives reloads, deep-links, and back/forward. Centralize the pattern in one tiny hook so Tasks 10 and 12 are trivial.

**Files:**

- Create: `src/hooks/useSelectedItem.ts`
- Create: `src/hooks/useSelectedItem.test.tsx`

**Step 1: Write the test**

```tsx
// src/hooks/useSelectedItem.test.tsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useSelectedItem } from "./useSelectedItem";

// Mock TanStack Router's useNavigate + useSearch hooks.
const mockNavigate = vi.fn();
let mockSearch: Record<string, unknown> = {};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearch,
}));

describe("useSelectedItem", () => {
  beforeEach(() => {
    mockSearch = {};
    mockNavigate.mockClear();
  });

  it("returns null when no selection in URL", () => {
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    expect(result.current.selectedId).toBeNull();
  });

  it("returns selected id from URL", () => {
    mockSearch = { selected: "abc-123" };
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    expect(result.current.selectedId).toBe("abc-123");
  });

  it("calls navigate with new selection when select() called", () => {
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    act(() => result.current.select("xyz-999"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.any(Function),
      })
    );
  });

  it("clears selection when clear() called", () => {
    mockSearch = { selected: "abc-123" };
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    act(() => result.current.clear());
    expect(mockNavigate).toHaveBeenCalled();
  });
});
```

**Step 2: Run test — should FAIL**

```bash
npx vitest run src/hooks/useSelectedItem.test.tsx
```

Expected: FAIL, module not found.

**Step 3: Implement the hook**

```ts
// src/hooks/useSelectedItem.ts
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

interface UseSelectedItemOptions {
  paramKey: string;
}

/**
 * Track a single "selected item" via URL search params so selection
 * survives reloads, deep-links, and back/forward navigation.
 *
 * Used by master-detail layouts (Accounts split, Transactions triple).
 */
export function useSelectedItem({ paramKey }: UseSelectedItemOptions) {
  const navigate = useNavigate();
  // useSearch is loosely typed at the call site; the consuming route
  // already validates its own search params, so we just read raw.
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const selectedId = (search[paramKey] as string | undefined) ?? null;

  const select = useCallback(
    (id: string) => {
      navigate({
        search: (prev: Record<string, unknown>) => ({ ...prev, [paramKey]: id }),
        replace: false,
      });
    },
    [navigate, paramKey]
  );

  const clear = useCallback(() => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next[paramKey];
        return next;
      },
      replace: false,
    });
  }, [navigate, paramKey]);

  return { selectedId, select, clear };
}
```

**Step 4: Run test — should PASS**

```bash
npx vitest run src/hooks/useSelectedItem.test.tsx
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add src/hooks/useSelectedItem.ts src/hooks/useSelectedItem.test.tsx
git commit -m "feat(hooks): add useSelectedItem for URL-synced master-detail selection"
```

---

## Task 10: Apply `split` variant to Accounts with master-detail behavior

**Purpose:** Wide-screen Accounts becomes a master-detail workspace. Left column lists accounts; right pane shows the selected account's detail. On narrow widths, falls back to the existing card grid + modal.

**Files:**

- Modify: `src/routes/accounts.tsx`
- Create: `src/components/accounts/AccountListItem.tsx` (compact row)
- Create: `src/components/accounts/AccountDetailPane.tsx` (right pane)

**Step 1: Add search param validation to the Accounts route**

In `src/routes/accounts.tsx`, update the route definition:

```tsx
export const Route = createFileRoute("/accounts")({
  component: Accounts,
  validateSearch: (search: Record<string, unknown>) => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
  }),
});
```

**Step 2: Create `AccountListItem` (compact row)**

```tsx
// src/components/accounts/AccountListItem.tsx
import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";

interface AccountListItemProps {
  id: string;
  name: string;
  type: string;
  balanceCents: number;
  selected: boolean;
  onSelect: () => void;
}

export function AccountListItem({
  name,
  type,
  balanceCents,
  selected,
  onSelect,
}: AccountListItemProps) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border px-4 py-3 text-left transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        selected && "bg-accent text-accent-foreground ring-2 ring-ring"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground capitalize">{type}</div>
        </div>
        <div className="font-mono tabular-nums">{formatPHP(balanceCents)}</div>
      </div>
    </button>
  );
}
```

**Step 3: Create `AccountDetailPane`**

```tsx
// src/components/accounts/AccountDetailPane.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPHP } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface AccountDetailPaneProps {
  accountId: string | null;
  accounts: Array<{ id: string; name: string; type: string }>;
  balances: Array<{
    accountId: string;
    currentBalance: number;
    clearedBalance: number;
    pendingBalance: number;
  }>;
  onAddAccount: () => void;
}

export function AccountDetailPane({
  accountId,
  accounts,
  balances,
  onAddAccount,
}: AccountDetailPaneProps) {
  if (!accountId) {
    const total = balances.reduce((sum, b) => sum + b.currentBalance, 0);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Total across all accounts</div>
            <div className="text-2xl font-mono tabular-nums">{formatPHP(total)}</div>
          </div>
          <Button onClick={onAddAccount} variant="outline" className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </CardContent>
      </Card>
    );
  }

  const account = accounts.find((a) => a.id === accountId);
  const balance = balances.find((b) => b.accountId === accountId);
  if (!account || !balance) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.name}</CardTitle>
        <p className="text-sm text-muted-foreground capitalize">{account.type}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground">Current balance</div>
          <div className="text-3xl font-mono tabular-nums">{formatPHP(balance.currentBalance)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Cleared {formatPHP(balance.clearedBalance)} · Pending{" "}
            {formatPHP(balance.pendingBalance)}
          </div>
        </div>
        {/* Recent transactions list and sparkline go in a follow-up pass.
            Keep this iteration scope-bounded to layout + selection. */}
      </CardContent>
    </Card>
  );
}
```

**Step 4: Update the Accounts route to use `split` + master-detail**

```tsx
// inside Accounts component
const { selected } = Route.useSearch();
const { selectedId, select } = useSelectedItem({ paramKey: "selected" });

// Auto-open the legacy modal only on narrow widths. The PageShell handles
// the visual collapse via container queries; for the *interaction*, we use
// a useMediaQuery hook so click behavior differs. Reusing existing hook.
const isNarrow = useMediaQuery("(max-width: 1099px)");

const handleAccountClick = (id: string) => {
  if (isNarrow) {
    setEditingId(id);
    setIsFormOpen(true);
  } else {
    select(id);
  }
};

// …

return (
  <div className="bg-background">
    {/* existing page header */}

    <PageShell variant="split">
      <PageShell.Main>
        {!accounts || accounts.length === 0 ? (
          <EmptyAccountsState onAdd={() => setIsFormOpen(true)} />
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => {
              const balance = balances?.find((b) => b.accountId === account.id);
              return (
                <AccountListItem
                  key={account.id}
                  id={account.id}
                  name={account.name}
                  type={account.type}
                  balanceCents={balance?.currentBalance ?? account.initial_balance_cents ?? 0}
                  selected={selectedId === account.id}
                  onSelect={() => handleAccountClick(account.id)}
                />
              );
            })}
          </div>
        )}
      </PageShell.Main>
      <PageShell.RightAside className="hidden @[1100px]:block">
        <AccountDetailPane
          accountId={selectedId}
          accounts={accounts ?? []}
          balances={balances ?? []}
          onAddAccount={() => setIsFormOpen(true)}
        />
      </PageShell.RightAside>
    </PageShell>

    <AccountFormDialog open={isFormOpen} onClose={…} editingId={editingId} />
  </div>
);
```

Add imports:

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { useSelectedItem } from "@/hooks/useSelectedItem";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { AccountListItem } from "@/components/accounts/AccountListItem";
import { AccountDetailPane } from "@/components/accounts/AccountDetailPane";
```

**Step 5: Visual check + interaction check**

```bash
npm run dev
```

- 1366px wide: list of accounts as a single column (right pane is `@[1100px]:block` hidden). Clicking an account opens the modal.
- 1920px wide: list left, detail right. Click an account → URL updates to `?selected=<id>` → detail pane updates. Refresh page → still selected.

**Step 6: Update Accounts baselines**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --grep "accounts" --update-snapshots --project=chromium
```

**Step 7: Add a Playwright spec for master-detail selection**

```ts
// tests/e2e/accounts-master-detail.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test.describe("Accounts master-detail", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("selecting an account updates URL and detail pane", async ({ page }) => {
    await page.goto("/accounts");
    const firstAccount = page.getByRole("button", { pressed: false }).first();
    const name = await firstAccount.locator(".font-medium").textContent();
    await firstAccount.click();
    await expect(page).toHaveURL(/selected=/);
    await expect(page.locator("aside[data-slot='right-aside']")).toContainText(name ?? "");
  });

  test("selection survives reload", async ({ page }) => {
    await page.goto("/accounts");
    await page.getByRole("button", { pressed: false }).first().click();
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("button", { pressed: true })).toBeVisible();
  });
});
```

```bash
npx playwright test tests/e2e/accounts-master-detail.spec.ts --project=chromium
```

Expected: 2 PASS.

**Step 8: Verify no other-page regressions**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --project=chromium
```

**Step 9: Commit**

```bash
git add src/routes/accounts.tsx src/components/accounts/ tests/e2e/accounts-master-detail.spec.ts tests/e2e/layout-baseline.spec.ts-snapshots/accounts-*.png
git commit -m "feat(accounts): master-detail with split PageShell variant"
```

---

## Task 11: Extract embeddable `TransactionFiltersPanel` (prep for Task 12)

**Purpose:** The current `TransactionFilters` component renders a full Card (likely with its own header/border). The `triple` layout needs it to live in a sidebar column where it should _not_ duplicate Card chrome. Refactor it into a presentational `TransactionFiltersPanel` that can be embedded either standalone or inside an outer Card.

**Files:**

- Modify: `src/components/TransactionFilters.tsx`

**Step 1: Read the current component**

```bash
sed -n '1,200p' src/components/TransactionFilters.tsx
```

**Step 2: Refactor**

If the component currently wraps its content in `<Card>`, extract the inner body into a new named export and have the default export wrap it:

```tsx
// New named export: presentational, no Card chrome.
export function TransactionFiltersPanel(props: TransactionFiltersProps) {
  return (
    <div className="space-y-4">
      {/* existing fields: search, date presets, From/To, Min/Max, selects, hide-transfers toggle, Apply */}
    </div>
  );
}

// Existing export keeps its Card wrapper for backward-compat (other call sites unchanged).
export function TransactionFilters(props: TransactionFiltersProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TransactionFiltersPanel {...props} />
      </CardContent>
    </Card>
  );
}
```

**Step 3: Verify the existing Transactions page still renders correctly**

```bash
npm run dev
```

Open `/transactions`. The filter card should look identical to before.

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --grep "transactions" --project=chromium
```

Expected: 3 PASS (no diffs).

**Step 4: Commit**

```bash
git add src/components/TransactionFilters.tsx
git commit -m "refactor(transactions): extract TransactionFiltersPanel for embedding"
```

---

## Task 12: Apply `triple` variant to Transactions

**Purpose:** Three-column layout on ≥1500px: filters left, transaction list middle, selected transaction detail right. Collapses to filters + list on 1100-1500px (detail = modal), and to list-only on <1100px (filters in sheet, detail = modal).

**Files:**

- Modify: `src/routes/transactions.tsx`
- Create: `src/components/transactions/TransactionDetailPane.tsx`
- Create: `src/components/transactions/TransactionFilterSheet.tsx` (narrow-width filter trigger)

**Step 1: Add `selected` to the route's search param validator**

Extend the existing `validateSearch` in `src/routes/transactions.tsx:22`:

```tsx
validateSearch: (search: Record<string, unknown>): TransactionFilters & { selected?: string } => ({
  // …existing fields…
  selected: typeof search.selected === "string" ? search.selected : undefined,
}),
```

**Step 2: Create `TransactionDetailPane`**

```tsx
// src/components/transactions/TransactionDetailPane.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/currency";
import { useTransaction } from "@/lib/supabaseQueries"; // add this hook if missing

interface TransactionDetailPaneProps {
  transactionId: string | null;
  filterSummary: { count: number; totalIn: number; totalOut: number };
  onEdit: (id: string) => void;
  onClear: () => void;
}

export function TransactionDetailPane({
  transactionId,
  filterSummary,
  onEdit,
  onClear,
}: TransactionDetailPaneProps) {
  if (!transactionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Filter summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm text-muted-foreground">Transactions</div>
            <div className="text-xl font-mono tabular-nums">{filterSummary.count}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">In</div>
              <div className="font-mono tabular-nums text-green-600 dark:text-green-400">
                {formatPHP(filterSummary.totalIn)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Out</div>
              <div className="font-mono tabular-nums text-red-600 dark:text-red-400">
                {formatPHP(filterSummary.totalOut)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <TransactionDetailContent id={transactionId} onEdit={onEdit} onClear={onClear} />;
}

function TransactionDetailContent({
  id,
  onEdit,
  onClear,
}: {
  id: string;
  onEdit: (id: string) => void;
  onClear: () => void;
}) {
  const { data, isLoading } = useTransaction(id);
  if (isLoading)
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  if (!data) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <CardTitle>{data.description || "Transaction"}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-mono tabular-nums">{formatPHP(data.amount_cents)}</div>
        <div className="text-sm text-muted-foreground">{data.date}</div>
        <Button variant="outline" className="w-full" onClick={() => onEdit(id)}>
          Edit
        </Button>
      </CardContent>
    </Card>
  );
}
```

If `useTransaction(id)` does not exist yet, add it to `src/lib/supabaseQueries.ts` as a single-row fetcher. (Out of scope for layout, but flag it.)

**Step 3: Create `TransactionFilterSheet` for narrow widths**

```tsx
// src/components/transactions/TransactionFilterSheet.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { TransactionFiltersPanel } from "@/components/TransactionFilters";
import type { TransactionFilters } from "@/types/transactions";

interface Props {
  filters: TransactionFilters;
  onFiltersChange: (next: TransactionFilters) => void;
}

export function TransactionFilterSheet({ filters, onFiltersChange }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[320px] sm:w-[380px]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <TransactionFiltersPanel filters={filters} onFiltersChange={onFiltersChange} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 4: Rewrite the Transactions route**

```tsx
function Transactions() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { selectedId, select, clear } = useSelectedItem({ paramKey: "selected" });
  const isNarrow = useMediaQuery("(max-width: 1499px)");

  usePrefetchTransactionData();
  useOpenTransactionFormShortcut(() => setIsFormOpen(true));

  const debouncedFilters = { ...search, search: useDebounce(search.search, 300) };
  const { data: transactions } = useTransactions(debouncedFilters);

  const filterSummary = {
    count: transactions?.length ?? 0,
    totalIn:
      transactions?.filter((t) => t.type === "income").reduce((s, t) => s + t.amount_cents, 0) ?? 0,
    totalOut:
      transactions?.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount_cents, 0) ??
      0,
  };

  const updateFilters = (next: TransactionFilters) =>
    navigate({ search: (prev) => ({ ...prev, ...next }) });

  const handleRowClick = (id: string) => {
    if (isNarrow) {
      setEditingId(id);
      setIsFormOpen(true);
    } else {
      select(id);
    }
  };

  return (
    <div className="bg-background">
      {/* Header bar unchanged */}

      <PageShell variant="triple">
        {/* Filters: in-line left aside on @[1100px]+, sheet trigger below */}
        <PageShell.LeftAside className="hidden @[1100px]:block">
          <TransactionFiltersPanel filters={search} onFiltersChange={updateFilters} />
        </PageShell.LeftAside>

        <PageShell.Main className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {transactions?.length || 0} transaction{transactions?.length !== 1 ? "s" : ""}
            </div>
            <div className="@[1100px]:hidden">
              <TransactionFilterSheet filters={search} onFiltersChange={updateFilters} />
            </div>
          </div>
          <TransactionList
            filters={debouncedFilters}
            onEdit={handleRowClick}
            selectedId={selectedId}
          />
        </PageShell.Main>

        <PageShell.RightAside className="hidden @[1500px]:block">
          <TransactionDetailPane
            transactionId={selectedId}
            filterSummary={filterSummary}
            onEdit={(id) => {
              setEditingId(id);
              setIsFormOpen(true);
            }}
            onClear={clear}
          />
        </PageShell.RightAside>
      </PageShell>

      <TransactionFormDialog
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingId(null);
        }}
        editingId={editingId}
      />
    </div>
  );
}
```

Add imports:

```tsx
import { PageShell } from "@/components/layout/PageShell";
import { useSelectedItem } from "@/hooks/useSelectedItem";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TransactionFiltersPanel } from "@/components/TransactionFilters";
import { TransactionFilterSheet } from "@/components/transactions/TransactionFilterSheet";
import { TransactionDetailPane } from "@/components/transactions/TransactionDetailPane";
```

**Step 5: Update `TransactionList` to accept and visually mark `selectedId`**

The minimal change: add `selectedId?: string | null` to props and apply a `bg-accent` row class when `transaction.id === selectedId`. Skip if `TransactionList` uses virtualization that doesn't allow per-row classes — in that case, add a render prop and defer the visual selection styling to a follow-up task.

**Step 6: Visual check at all breakpoints**

```bash
npm run dev
```

- 1366px: filters in sheet (button at top of list), list full-width, click row → modal.
- 1700px (resize): filters left column, list middle, click row → modal (still narrow per `@[1500px]:` threshold).
- 2200px: filters left, list middle, detail pane right. Click row → URL `?selected=` updates → detail renders.

**Step 7: Update Transactions baselines**

```bash
npx playwright test tests/e2e/layout-baseline.spec.ts --grep "transactions" --update-snapshots --project=chromium
```

**Step 8: Add Playwright spec for triple-column interactions**

```ts
// tests/e2e/transactions-triple.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test.describe("Transactions triple layout", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("ultrawide shows filters left, detail right; selecting a row updates URL", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2200, height: 1200 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeVisible();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeVisible();
    // …seed at least one transaction in fixtures, then click it…
  });

  test("mid width hides detail pane, row click opens modal", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeVisible();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeHidden();
  });

  test("narrow width hides both asides, filter sheet trigger appears", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeHidden();
    await expect(page.getByRole("button", { name: /filters/i })).toBeVisible();
  });
});
```

```bash
npx playwright test tests/e2e/transactions-triple.spec.ts --project=chromium
```

**Step 9: Run all e2e tests to catch wider regressions**

```bash
npm run test:e2e:smoke
```

**Step 10: Commit**

```bash
git add src/routes/transactions.tsx src/components/transactions/ src/components/TransactionList.tsx tests/e2e/transactions-triple.spec.ts tests/e2e/layout-baseline.spec.ts-snapshots/transactions-*.png
git commit -m "feat(transactions): triple-column layout with filters and detail pane"
```

---

## Task 13: Final pass — verification, accessibility, docs

**Files:**

- Modify: `CLAUDE.md` (add a note on PageShell)

**Step 1: Run the full test suite**

```bash
npm test
npm run test:e2e:smoke
npx playwright test tests/e2e/layout-baseline.spec.ts --project=chromium
```

Expected: all green.

**Step 2: Manual accessibility check**

For each migrated page, in the browser:

- Tab through the page. Focus order should be: header → main content → (rail content if visible). The "Skip to main content" link in `AppLayout` still works.
- Verify the right rail / detail pane has appropriate landmark role (`<aside>` already provides this).
- Run an axe scan via the existing `accessibility.spec.ts` if present.

**Step 3: Document the PageShell pattern in CLAUDE.md**

Add a short note under "Code Organization" or "Important Patterns":

```markdown
### PageShell layout primitive

Every route uses `<PageShell variant="…">` from `src/components/layout/PageShell.tsx`.
Variants: `centered` (default), `rail`, `split`, `nav-content`, `triple`.
Responsive collapse is handled via Tailwind container queries on the page region.
See `docs/plans/2026-05-30-wide-screen-layout-design.md` for the rationale.
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note PageShell layout primitive in CLAUDE.md"
```

**Step 5: Open a PR (only if user requests)**

```bash
# Only run when user confirms
gh pr create --title "Wide-screen layout: PageShell primitive + per-page variants" --body "$(cat <<'EOF'
## Summary
- Adds `PageShell` layout primitive with five variants (centered, rail, split, nav-content, triple)
- Migrates Dashboard, Analytics, Settings, Accounts, Transactions to make use of wide screens
- Master-detail (Accounts, Transactions) with URL-synced selection
- Filters move to sticky rail on Analytics; left column on Transactions
- Modal-based create/edit flows preserved as narrow-screen fallback

Design: `docs/plans/2026-05-30-wide-screen-layout-design.md`
Plan: `docs/plans/2026-05-31-wide-screen-layout-implementation.md`

## Test plan
- [ ] Visual baselines pass at 1366 / 1920 / 2560 widths for all five migrated pages
- [ ] Accounts master-detail: select → URL updates, reload preserves selection
- [ ] Transactions triple: filters left ≥1100px, detail right ≥1500px, sheet/modal fallback below
- [ ] Mobile smoke tests still pass (`npm run test:e2e:smoke`)
- [ ] No regressions on Budgets, Categories, Transfers, Drafts, Import (centered, unchanged)
EOF
)"
```

---

## Out-of-scope follow-ups (track separately)

These are explicitly _not_ in this plan. Capture as issues if you want them:

- Dashboard rail: account balances mini-list, top-3 categories, budget snapshots (Task 6 ships just the donut)
- Accounts detail pane: balance sparkline, recent 10 transactions
- Transactions detail pane: history/audit, related transactions, inline-edit
- Settings: scroll-spy so the section nav highlights the visible section
- Analytics: "Insights" card surfacing largest expense and biggest category jump
- Animation polish: slide-in for detail pane, fade for rail toggle

---

## Verification matrix

After Task 13, the following should all be true:

| Check                    | Command                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Unit tests pass          | `npm test`                                                                                           |
| Smoke E2E passes         | `npm run test:e2e:smoke`                                                                             |
| Layout baselines pass    | `npx playwright test tests/e2e/layout-baseline.spec.ts`                                              |
| Master-detail specs pass | `npx playwright test tests/e2e/accounts-master-detail.spec.ts tests/e2e/transactions-triple.spec.ts` |
| Build succeeds           | `npm run build`                                                                                      |
| No new lint errors       | `npm run lint`                                                                                       |
| No new TS errors         | `npx tsc --noEmit`                                                                                   |
