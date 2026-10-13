import { Home, Import, Layers, Receipt, Settings, type LucideIcon } from "lucide-react";
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
}

// Budget and Review join the daily group, and Accounts leads the manage group, with their issues.
export const DAILY_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home, shortcut: "g h", tab: true },
  { to: "/transactions", label: "Transactions", icon: Receipt, shortcut: "g t", tab: true },
];

export const MANAGE_NAV: NavItem[] = [
  { to: "/import", label: "Import", icon: Import },
  { to: "/categories", label: "Categories", icon: Layers, shortcut: "g c" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "g s" },
];

export const TAB_NAV = DAILY_NAV.filter((item) => item.tab);

/** The drawer holds everything off the tab bar, daily first. */
export const DRAWER_NAV = [...DAILY_NAV, ...MANAGE_NAV].filter((item) => !item.tab);

/** "/" matches only itself; every other item also matches its child routes. */
export const isNavItemActive = (to: string, pathname: string) =>
  to === "/" ? pathname === to : pathname === to || pathname.startsWith(to + "/");
