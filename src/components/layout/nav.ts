import { useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardCheck,
  FileUp,
  Home,
  Layers,
  PiggyBank,
  Receipt,
  Settings,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ASSISTANT_URL } from "@/lib/assistant/config";
import type { FileRoutesByTo } from "@/routeTree.gen";

export type RoutePath = keyof FileRoutesByTo;

export interface NavItem {
  to: RoutePath;
  label: string;
  icon: LucideIcon;
  /** Gmail-style "g then x" shortcut, shown in the sidebar. */
  shortcut?: string;
  /** Also on the phone's bottom tab bar. */
  tab?: boolean;
  /** Shows how many items wait for review. */
  reviewCount?: boolean;
}

/** Every destination, in rail and drawer order. */
export const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home, shortcut: "g h", tab: true },
  { to: "/transactions", label: "Transactions", icon: Receipt, shortcut: "g t", tab: true },
  { to: "/accounts", label: "Accounts", icon: Wallet, shortcut: "g a", tab: true },
  { to: "/categories", label: "Categories", icon: Layers, shortcut: "g c", tab: true },
  { to: "/review", label: "Review", icon: ClipboardCheck, shortcut: "g r", reviewCount: true },
  { to: "/budget", label: "Budget", icon: PiggyBank, shortcut: "g b" },
  ...(ASSISTANT_URL ? [{ to: "/assistant", label: "Assistant", icon: Sparkles } as const] : []),
  { to: "/import", label: "Import", icon: FileUp, shortcut: "g i" },
  { to: "/reports", label: "Reports", icon: BarChart3, shortcut: "g p" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "g s" },
];

export const TAB_NAV = NAV.filter((item) => item.tab);

const matchesPath = (to: string, pathname: string) =>
  to === "/" ? pathname === to : pathname === to || pathname.startsWith(to + "/");

/**
 * "/" matches only itself; every other item also matches its child routes. A
 * pushed screen highlights its `parent` (Set budgets highlights Budget).
 */
export const isNavItemActive = (to: string, pathname: string, parent?: string) =>
  matchesPath(to, pathname) || to === parent;

/** Whether a nav item matches the current route, its parent included. */
export function useIsNavItemActive() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const parent = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.parent });
  return (to: string) => isNavItemActive(to, pathname, parent);
}
