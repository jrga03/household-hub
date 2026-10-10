import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Settings, ChevronLeft, LogOut, User } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/authStore";
import { signOutWithToast } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

/**
 * Sidebar navigation for desktop and tablet views: collapsible to icon-only
 * mode, active route highlighting, user profile and sign out.
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout component
 */

interface NavItem {
  to: "/" | "/settings";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
}

const navItems: NavItem[] = [
  { to: "/", label: "Home", icon: Home, shortcut: "g h" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "g s" },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const user = useAuthStore((state) => state.user);
  const { open } = useSidebar();

  const isActiveRoute = (path: string) =>
    path === "/" ? pathname === path : pathname === path || pathname.startsWith(path + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between px-2">
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

          {open && (
            <SidebarTrigger className="-mr-1">
              <ChevronLeft className="h-4 w-4" />
            </SidebarTrigger>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActiveRoute(item.to)}
                      tooltip={item.label}
                    >
                      <Link to={item.to}>
                        <item.icon className="h-4 w-4" />
                        {open && (
                          <>
                            <span>{item.label}</span>
                            <span
                              className={cn(
                                "ml-auto text-xs",
                                isActiveRoute(item.to)
                                  ? "text-sidebar-accent-foreground"
                                  : "text-muted-foreground"
                              )}
                            >
                              {item.shortcut}
                            </span>
                          </>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
            <SidebarMenuButton onClick={() => void signOutWithToast()} tooltip="Sign Out">
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
