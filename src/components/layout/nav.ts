import { useRouterState } from "@tanstack/react-router";
import {
  ClipboardCheck,
  FileUp,
  Home,
  Layers,
  PiggyBank,
  Receipt,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { FileRoutesByTo } from "@/routeTree.gen";

export type RoutePath = keyof FileRoutesByTo;

export interface NavItem {
  to: RoutePath;
  label: string;
  icon: LucideIcon;
  /** Gmail-style "g then x" shortcut, shown in the sidebar. */
  shortcut?: string;
  /** On the phone's bottom tab bar instead of in the drawer. */
  tab?: boolean;
  /** Shows how many items wait for review. */
  reviewCount?: boolean;
}

export const DAILY_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home, shortcut: "g h", tab: true },
  { to: "/transactions", label: "Transactions", icon: Receipt, shortcut: "g t", tab: true },
  { to: "/budget", label: "Budget", icon: PiggyBank, shortcut: "g b" },
  { to: "/review", label: "Review", icon: ClipboardCheck, shortcut: "g r", reviewCount: true },
];

export const MANAGE_NAV: NavItem[] = [
  { to: "/accounts", label: "Accounts", icon: Wallet, shortcut: "g a" },
  { to: "/import", label: "Import", icon: FileUp, shortcut: "g i" },
  { to: "/categories", label: "Categories", icon: Layers, shortcut: "g c" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "g s" },
];

export const TAB_NAV = [...DAILY_NAV, ...MANAGE_NAV].filter((item) => item.tab);

/** The drawer holds everything off the tab bar, daily first. */
export const DRAWER_NAV = [...DAILY_NAV, ...MANAGE_NAV].filter((item) => !item.tab);

const matchesPath = (to: string, pathname: string) =>
  to === "/" ? pathname === to : pathname === to || pathname.startsWith(to + "/");

/**
 * "/" matches only itself; every other item also matches its child routes. A
 * pushed screen highlights its `parent` (Plan highlights Budget).
 */
export const isNavItemActive = (to: string, pathname: string, parent?: string) =>
  matchesPath(to, pathname) || to === parent;

/** Whether a nav item matches the current route, its parent included. */
export function useIsNavItemActive() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const parent = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.parent });
  return (to: string) => isNavItemActive(to, pathname, parent);
}
