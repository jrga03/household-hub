# Wide-Screen Layout Design

**Date**: 2026-05-30
**Status**: Approved (brainstorming complete, implementation plan not yet written)

## Problem

Every route currently wraps content in `container mx-auto max-w-7xl px-4`, which caps content at 1280px and centers it inside the area to the right of the global sidebar. On displays wider than ~1700px, the right side of every page is unused dark space. The most visible symptoms:

- **Dashboard**: KPI cards stretch into ~300px-tall mostly-empty rectangles. Charts and recent transactions also stretch wider than they need.
- **Transactions**: filter panel eats the top of the page; empty list has acres of blank space below.
- **Analytics**: same as Transactions, plus stretched KPI cards.
- **Accounts**: a single account card floats alone on a near-empty canvas.
- **Settings**: form sections sprawl wider than is comfortable to read.

The goal is to use that space meaningfully on wide screens while preserving the current mobile and small-laptop behavior unchanged.

## Decisions

1. **Responsive across all viewports**: design the strongest treatment for each page, let it degrade to simpler variants on smaller widths, and keep mobile (single-column) behavior intact.
2. **Medium-scope redesign**: introduce side rails on dashboard-style pages and master-detail patterns on Transactions and Accounts. No "full workspace" reinvention.
3. **Master-detail uses right-pane on wide screens, modals on narrow**: existing modal-based edit/view flows are retained as the narrow-screen fallback rather than retired.
4. **Container queries, not viewport media queries**: the global sidebar can collapse, so the actual content area varies independently from the viewport. Container queries on the page region give correct breakpoints.

## Architecture

### Shared `PageShell` primitive

One layout primitive replaces the ad-hoc `container mx-auto max-w-7xl` wrappers in each route. The component declares layout intent; the shell handles widths, padding, and breakpoint collapsing.

```tsx
<PageShell variant="centered" | "rail" | "split" | "nav-content" | "triple">
  <PageShell.LeftAside>…</PageShell.LeftAside>   {/* nav-content, triple */}
  <PageShell.Main>…</PageShell.Main>             {/* all variants */}
  <PageShell.RightAside>…</PageShell.RightAside> {/* rail, split, triple */}
</PageShell>
```

Variants:

| Variant       | Layout                                   | Use case                                                        |
| ------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `centered`    | single column, `max-w-7xl mx-auto`       | Default. Drafts, Import wizard, Budgets, Categories, Transfers. |
| `rail`        | main + right rail                        | Dashboard, Analytics. Rail holds secondary widgets.             |
| `split`       | left main + right detail (master-detail) | Accounts. Click an item → detail in right pane.                 |
| `nav-content` | left section nav + content               | Settings. Sticky vertical nav.                                  |
| `triple`      | left aside + main + right aside          | Transactions only. Filters left, list middle, detail right.     |

### Breakpoints (container queries on the page region)

| Container width | `rail`                | `split`                    | `nav-content`                  | `triple`                                          |
| --------------- | --------------------- | -------------------------- | ------------------------------ | ------------------------------------------------- |
| < 1100px        | rail moves below main | list only, detail = modal  | nav becomes tabs above content | filters in sheet, list full-width, detail = modal |
| 1100–1500px     | narrow rail (~320px)  | compact split (50/50)      | narrow nav (~200px)            | filters left (~240px) + list; detail = modal      |
| ≥ 1500px        | full rail (~380px)    | comfortable split (~55/45) | full nav (~240px)              | filters (~260px) + list + detail (~480px)         |

Mobile (< 768px) always renders as single column regardless of variant. Existing mobile flows are unchanged.

## Per-Page Treatments

### Dashboard → `rail`

- **Main**: KPI cards (4-up), Monthly Trend chart, Recent Transactions
- **Rail**: Account balances mini-list · Spending by Category as a compact donut · Top 3 categories this month · Budget snapshots (if any exist)

The current 2-up "Monthly Trend + Spending by Category" grid is replaced. Monthly Trend gets the main column at full width; Spending by Category moves into the rail as a smaller donut.

### Transactions → `triple`

- **Left aside (filters)**: search + date presets + From/To · Min/Max amount · Account/Category/Type/Status selects · Hide-transfers toggle · Apply button
- **Main (list)**: result count, sort controls, transaction rows
- **Right aside (detail)**: when nothing selected, show filter summary (count, total in/out/net, top 3 categories for current filter); when a row is selected, show full transaction read view with edit-in-place and history

At 1100–1500px container width: filters stay in the left aside, but the right detail pane collapses and selecting a row opens the existing transaction modal instead. Below 1100px: filters revert to the current Sheet/Drawer pattern, list is full-width, row click opens modal.

### Analytics → `rail`

- **Main**: KPI grid + charts (wider and taller than today)
- **Rail**: sticky filter panel (date range, account, category, type) with Apply/Clear; plus an Insights card surfacing largest expense for the period and biggest category jump vs prior period

The big "Filters" card that currently dominates the top of the page is removed; its controls live in the rail.

### Accounts → `split`

- **Main (left)**: compact account rows — icon, name, balance — replacing the large cards
- **Right aside (detail)**: selected account's balance + sparkline of balance over time · recent 10 transactions · edit/archive actions. When nothing selected, show "Total across all accounts" summary card plus an "Add Account" CTA so the pane is never empty.

Below 1100px: cards in a single column; tap opens a dedicated `/accounts/$id` route or modal (decided in implementation plan).

### Settings → `nav-content`

- **Left nav**: Appearance · Data Export · Storage Management · Notifications · Account · Sync · (existing sections)
- **Content**: each section, but capped at `max-w-2xl` so form labels and inputs stay readable. Anchor links so deep links and `#section` URLs work.

Below 900px: nav becomes a horizontal tab bar above content; content goes full-width.

## Out-of-Scope (default to `centered`)

Budgets, Categories, Transfers, Import (CSV/PDF), Drafts. These are either wizard-flow, sparse enough that a rail would feel forced, or already scroll long. Revisit case-by-case if needed.

## Rationale

- A single `PageShell` primitive means future pages get the same treatment for free, and tweaks to padding, breakpoints, or rail width happen once.
- Container queries are mandatory because the sidebar can collapse, decoupling content width from viewport width. Using media queries here would cause layouts to snap at incorrect moments (e.g., showing the rail when there's no room for it).
- Master-detail with modal fallback preserves all existing modal-based create/edit flows, which already handle their own validation, focus management, and offline state. The right-pane variant is purely a wide-screen affordance, not a replacement.
- Three-column Transactions resolves the conflict between "filters on the side" (user request) and "selected transaction in a detail pane" (master-detail) by giving each its own column on widths that can support it, and collapsing detail to modal on narrower widths.

## Open Questions

None blocking. Implementation plan should clarify:

- Exact `max-w-*` Tailwind values per breakpoint
- Whether selected-row state lives in URL search params (deep-linkable) or local component state
- Whether to introduce a `useContainerSize` hook or rely purely on Tailwind's `@container` variants
- Animation/transition for rail collapse and row selection
