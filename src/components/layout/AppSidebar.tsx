import { Link } from "@tanstack/react-router";
import { ChevronLeft, LogOut, User } from "lucide-react";
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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/authStore";
import { signOutWithToast } from "@/lib/sign-out";
import { cn } from "@/lib/utils";
import { DAILY_NAV, useIsNavItemActive, MANAGE_NAV, type NavItem } from "./nav";
import { ReviewCountBadge, ReviewDot, reviewLabel } from "./ReviewCount";
import { useReviewCount } from "@/hooks/useReviewCount";

/**
 * Sidebar navigation for desktop and tablet views: the daily and manage
 * groups, collapsible to icon-only mode, with the user profile and sign out.
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout component
 */

export function AppSidebar() {
  const user = useAuthStore((state) => state.user);
  const { open } = useSidebar();
  const reviewCount = useReviewCount();

  const isActiveRoute = useIsNavItemActive();

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={isActiveRoute(item.to)} tooltip={item.label}>
          <Link
            to={item.to}
            className="relative"
            aria-label={item.reviewCount ? reviewLabel(item.label, reviewCount) : undefined}
          >
            <item.icon className="h-4 w-4" />
            {open ? (
              <>
                <span>{item.label}</span>
                <span className="ml-auto flex items-center gap-2">
                  {item.reviewCount && <ReviewCountBadge count={reviewCount} />}
                  {item.shortcut && (
                    <span
                      className={cn(
                        "text-caption",
                        isActiveRoute(item.to)
                          ? "text-sidebar-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {item.shortcut}
                    </span>
                  )}
                </span>
              </>
            ) : (
              item.reviewCount && <ReviewDot className="right-1 top-1" />
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-body font-bold">HH</span>
            </div>
            {open && (
              <div className="flex flex-col">
                <span className="text-body font-semibold">Household Hub</span>
                <span className="text-caption text-muted-foreground">Finance Tracker</span>
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
              <SidebarMenu>{renderItems(DAILY_NAV)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(MANAGE_NAV)}</SidebarMenu>
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
                  <span className="text-body font-medium">
                    {user?.email?.split("@")[0] || "User"}
                  </span>
                  <span className="text-caption text-muted-foreground">{user?.email}</span>
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
