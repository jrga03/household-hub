import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { TAB_NAV, useIsNavItemActive } from "./nav";

/**
 * Fixed bottom tab bar for the mobile layout branch: Home, Transactions,
 * Accounts and Categories, below the floating Add button. Everything else is
 * in the MobileNav drawer.
 *
 * Geometry: the content row is `--tab-bar-height` tall plus the iOS
 * home-indicator safe area. Everything else pinned to the bottom edge
 * (toasts, main-content padding) derives its offset from `--bottom-chrome`
 * in index.css.
 *
 * Active state: the rail's rule (useIsNavItemActive), so a pushed screen
 * lights its parent tab.
 *
 * Scope: mobile branch only. The tablet/desktop branch, including landscape
 * phones, keeps the sidebar.
 *
 * @see src/components/layout/AppLayout.tsx - Mobile branch mount point
 */

export function BottomTabBar() {
  const isActive = useIsNavItemActive();

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[var(--safe-area-bottom)]"
    >
      <div className="grid h-[var(--tab-bar-height)] auto-cols-fr grid-flow-col">
        {TAB_NAV.map((tab) => {
          const active = isActive(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 text-caption font-medium leading-none transition-colors hover:text-foreground active:bg-accent",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <tab.icon className="size-5" aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
