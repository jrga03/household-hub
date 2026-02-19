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
  Plus,
  ChevronLeft,
  LogOut,
  User,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/authStore";
import { useNavStore } from "@/stores/navStore";
import { SyncIndicator } from "@/components/SyncIndicator";
import { cn } from "@/lib/utils";
import { getShortcutKey } from "@/hooks/useKeyboardShortcuts";
import { useLiveQuery } from "dexie-react-hooks";
import { getPendingDraftCount } from "@/lib/import-drafts";

/**
 * Main sidebar navigation component for desktop and tablet views
 *
 * Features:
 * - Collapsible to icon-only mode
 * - Active route highlighting
 * - Section-based grouping
 * - Quick add transaction button
 * - Sync status indicator
 * - User profile and logout
 * - Keyboard shortcuts display
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout component
 * @see src/stores/navStore.ts - Navigation state management
 */

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  shortcut?: string;
  children?: NavItem[];
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Core Financial",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        shortcut: getShortcutKey("D", true),
      },
      {
        to: "/transactions",
        label: "Transactions",
        icon: Receipt,
        shortcut: getShortcutKey("T", true),
      },
      {
        to: "/accounts",
        label: "Accounts",
        icon: CreditCard,
        shortcut: getShortcutKey("A", true),
      },
    ],
  },
  {
    label: "Planning & Analysis",
    items: [
      {
        to: "/budgets",
        label: "Budgets",
        icon: Target,
        shortcut: getShortcutKey("B", true),
      },
      {
        to: "/categories",
        label: "Categories",
        icon: Tags,
        shortcut: getShortcutKey("C", true),
      },
      {
        to: "/analytics",
        label: "Analytics",
        icon: BarChart3,
        children: [
          {
            to: "/analytics/categories",
            label: "By Category",
            icon: Tags,
          },
        ],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        to: "/transfers",
        label: "Transfers",
        icon: ArrowLeftRight,
      },
      {
        to: "/import",
        label: "Import",
        icon: Upload,
        children: [
          {
            to: "/import",
            label: "CSV",
            icon: FileSpreadsheet,
          },
          {
            to: "/import/pdf",
            label: "PDF Statement",
            icon: FileText,
          },
        ],
      },
      {
        to: "/drafts",
        label: "Drafts",
        icon: FileText,
      },
    ],
  },
];

export function AppSidebar() {
  const router = useRouterState();
  const user = useAuthStore((state) => state.user);
  const setQuickAddOpen = useNavStore((state) => state.setQuickAddOpen);
  const { open, setOpen: _setOpen } = useSidebar();
  const draftCount = useLiveQuery(() => getPendingDraftCount()) ?? 0;

  // Inject dynamic badge count into the Drafts nav item
  const sections = navSections.map((section) => ({
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

  const handleSignOut = async () => {
    const signOut = useAuthStore.getState().signOut;
    await signOut();
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between px-2">
          {/* Logo / Title */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">HH</span>
            </div>
            {open && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Household Hub</span>
                <span className="text-xs text-muted-foreground">Finance Tracker</span>
              </div>
            )}
          </div>

          {/* Collapse toggle (only visible when expanded) */}
          {open && (
            <SidebarTrigger className="-mr-1">
              <ChevronLeft className="h-4 w-4" />
            </SidebarTrigger>
          )}
        </div>

        {/* Quick Add Button */}
        <div className="px-2 pt-2">
          <Button
            className="w-full"
            onClick={() => setQuickAddOpen(true)}
            title={getShortcutKey("N", true)}
          >
            <Plus className="h-4 w-4" />
            {open && <span className="ml-2">Add Transaction</span>}
          </Button>
        </div>

        {/* Sync Status */}
        <div className="px-2 pt-2 pb-1">
          <SyncIndicator compact={!open} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          {sections.map((section, idx) => (
            <SidebarGroup key={section.label}>
              {open && (
                <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <NavMenuItem
                      key={item.to}
                      item={item}
                      isActive={isActiveRoute(item.to)}
                      isOpen={open}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
              {idx < sections.length - 1 && <Separator className="my-2" />}
            </SidebarGroup>
          ))}

          {/* Settings (always at bottom of scrollable area) */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActiveRoute("/settings")}
                    tooltip="Settings"
                  >
                    <Link to="/settings">
                      <Settings className="h-4 w-4" />
                      {open && (
                        <>
                          <span>Settings</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {getShortcutKey("S", true)}
                          </span>
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-2 py-2">
              {/* User Avatar */}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4" />
              </div>
              {open && (
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {user?.email?.split("@")[0] || "User"}
                  </span>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                </div>
              )}
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} tooltip="Sign Out">
              <LogOut className="h-4 w-4" />
              {open && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Individual navigation menu item component
 * Handles active states, nested items, and tooltips
 */
function NavMenuItem({
  item,
  isActive,
  isOpen,
}: {
  item: NavItem;
  isActive: boolean;
  isOpen: boolean;
}) {
  const router = useRouterState();

  // Check if any child is active
  const hasActiveChild = item.children?.some((child) => {
    const currentPath = router.location.pathname;
    return currentPath === child.to || currentPath.startsWith(child.to + "/");
  });

  // If this item has children, render as collapsible
  if (item.children) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={item.label}
          className={cn(hasActiveChild && "bg-accent")}
        >
          <Link to={item.to}>
            <item.icon className="h-4 w-4" />
            {isOpen && <span>{item.label}</span>}
            {item.badge && (
              <Badge variant="destructive" className="ml-auto">
                {item.badge}
              </Badge>
            )}
          </Link>
        </SidebarMenuButton>
        {isOpen && item.children && (
          <SidebarMenuSub>
            {item.children.map((child) => (
              <SidebarMenuSubItem key={child.to}>
                <SidebarMenuSubButton
                  asChild
                  isActive={
                    router.location.pathname === child.to ||
                    router.location.pathname.startsWith(child.to + "/")
                  }
                >
                  <Link to={child.to}>
                    <child.icon className="h-3 w-3" />
                    <span>{child.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  }

  // Regular menu item
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <Link to={item.to}>
          <item.icon className="h-4 w-4" />
          {isOpen && (
            <>
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="ml-auto text-xs text-muted-foreground">{item.shortcut}</span>
              )}
              {item.badge && (
                <Badge variant="destructive" className="ml-auto">
                  {item.badge}
                </Badge>
              )}
            </>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
