import { Link } from "@tanstack/react-router";
import { CreditCard, LayoutDashboard, Receipt, Target } from "lucide-react";

/**
 * Fixed bottom tab bar for the mobile layout branch (mobile UX review R42)
 *
 * The four highest-frequency destinations (Dashboard, Transactions, Budgets,
 * Accounts) get one-tap, thumb-reachable navigation with glanceable active
 * state. The long tail (Transfers, Categories, Analytics, Drafts, Import,
 * Settings, sign out) stays in the MobileNav drawer.
 *
 * Geometry:
 * - Content row is `--tab-bar-height` tall (3.5rem = 56px, comfortably over
 *   the 44px touch floor) plus `pb-[var(--safe-area-bottom)]` for the iOS
 *   home-indicator zone.
 * - Everything else pinned to the bottom edge (FAB, sync-issues badge, toasts,
 *   main-content padding) derives its offset from `--bottom-chrome` in
 *   index.css, which equals tab bar height + safe area at mobile widths.
 *
 * Active state:
 * - TanStack Link fuzzy matching is segment-aware prefix matching, so
 *   /transactions/abc keeps the Transactions tab lit (same semantics as
 *   MobileNav's isActiveRoute). "/" must be exact-matched or it would match
 *   every route. Active links get aria-current="page" from the router.
 *
 * Layering: z-40 sits above page content but below sheets/dialogs (z-50), so
 * bottom sheets (TransactionDetailSheet, mobile TransactionFormDialog)
 * overlay the bar rather than stacking on top of it.
 *
 * Scope (deliberate): mobile branch ONLY. The tablet/desktop branch — which
 * includes landscape phones (review C3) — keeps the sidebar + coarse-pointer
 * FAB and gets no tab bar.
 *
 * @see src/components/layout/AppLayout.tsx - Mobile branch mount point
 */

const TABS = [
  // "/" would fuzzy-match every route; it must be exact
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/transactions", label: "Transactions", icon: Receipt, exact: false },
  { to: "/budgets", label: "Budgets", icon: Target, exact: false },
  { to: "/accounts", label: "Accounts", icon: CreditCard, exact: false },
] as const;

export function BottomTabBar() {
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[var(--safe-area-bottom)]"
    >
      <div className="grid h-[var(--tab-bar-height)] grid-cols-4">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-label={tab.label}
            activeOptions={{ exact: tab.exact, includeSearch: false }}
            activeProps={{ className: "text-primary" }}
            inactiveProps={{ className: "text-muted-foreground" }}
            className="flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none transition-colors hover:text-foreground active:bg-accent"
          >
            <tab.icon className="size-5" aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
