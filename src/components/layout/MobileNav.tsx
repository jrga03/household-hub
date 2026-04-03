import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Target,
  Tags,
  BarChart3,
  ArrowLeftRight,
  Upload,
  Settings,
  LogOut,
  User,
  X,
  FileText,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/authStore";
import { useNavStore } from "@/stores/navStore";
import { SyncIndicator } from "@/components/SyncIndicator";
import { cn } from "@/lib/utils";
import { useLiveQuery } from "dexie-react-hooks";
import { getPendingDraftCount } from "@/lib/import-drafts";

/**
 * Mobile navigation drawer component
 *
 * Uses Sheet component for a sliding drawer from the left.
 * Auto-closes on navigation to provide smooth UX.
 *
 * Features:
 * - Full-height drawer with scrollable content
 * - Touch-friendly navigation items
 * - User profile section
 * - Sync status indicator
 * - Auto-close on route change
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout component
 */

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

const navItems: { section: string; items: NavItem[] }[] = [
  {
    section: "Core Financial",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/transactions", label: "Transactions", icon: Receipt },
      { to: "/accounts", label: "Accounts", icon: CreditCard },
    ],
  },
  {
    section: "Planning & Analysis",
    items: [
      { to: "/budgets", label: "Budgets", icon: Target },
      { to: "/categories", label: "Categories", icon: Tags },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    section: "Operations",
    items: [
      { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
      { to: "/import", label: "CSV Import", icon: Upload },
      { to: "/import/pdf", label: "PDF Import", icon: FileText },
      { to: "/drafts", label: "Drafts", icon: FileText },
    ],
  },
];

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const router = useRouterState();
  const user = useAuthStore((state) => state.user);
  const setQuickAddOpen = useNavStore((state) => state.setQuickAddOpen);
  const draftCount = useLiveQuery(() => getPendingDraftCount()) ?? 0;

  // Inject dynamic badge into Drafts item
  const sections = navItems.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.to === "/drafts" && draftCount > 0 ? { ...item, badge: draftCount } : item
    ),
  }));

  // Check if a route is active
  const isActiveRoute = (path: string) => {
    const currentPath = router.location.pathname;
    if (path === "/") {
      return currentPath === path;
    }
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  // Handle navigation - close drawer after navigation
  const handleNavigation = () => {
    onOpenChange(false);
  };

  const handleSignOut = async () => {
    const signOut = useAuthStore.getState().signOut;
    await signOut();
    onOpenChange(false);
  };

  const handleQuickAdd = () => {
    setQuickAddOpen(true);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 p-0 gap-0">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-sm font-bold">HH</span>
              </div>
              <div className="flex flex-col">
                <SheetTitle className="text-base">Household Hub</SheetTitle>
                <span className="text-xs text-muted-foreground">Finance Tracker</span>
              </div>
            </div>
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close menu</span>
            </Button>
          </div>
        </SheetHeader>

        {/* User Profile Section */}
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <User className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.email?.split("@")[0] || "User"}</span>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border-b px-6 py-3">
          <Button className="w-full" onClick={handleQuickAdd}>
            Add Transaction
          </Button>
        </div>

        {/* Sync Status */}
        <div className="border-b px-6 py-3">
          <SyncIndicator />
        </div>

        {/* Navigation Items */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-3 py-2">
            {sections.map((section, sectionIdx) => (
              <div key={section.section} className="mb-4">
                <div className="mb-2 px-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.section}
                  </span>
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = isActiveRoute(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={handleNavigation}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          "hover:bg-accent hover:text-accent-foreground",
                          isActive && "bg-accent text-accent-foreground font-medium"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                            {item.badge}
                          </Badge>
                        )}
                        {isActive && <div className="h-5 w-1 rounded-full bg-primary" />}
                      </Link>
                    );
                  })}
                </div>
                {sectionIdx < sections.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}

            {/* Settings Section */}
            <div className="mb-4">
              <Separator className="mb-4" />
              <Link
                to="/settings"
                onClick={handleNavigation}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActiveRoute("/settings") && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <Settings className="h-5 w-5" />
                <span className="flex-1">Settings</span>
                {isActiveRoute("/settings") && <div className="h-5 w-1 rounded-full bg-primary" />}
              </Link>
            </div>

            {/* Sign Out */}
            <div className="mb-4">
              <Separator className="mb-4" />
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="h-5 w-5" />
                <span className="flex-1 text-left">Sign Out</span>
              </button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
