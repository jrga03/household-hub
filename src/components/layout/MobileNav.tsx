import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Settings, User, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/authStore";
import { signOutWithToast } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation drawer: the user profile, Settings and sign out. Primary
 * destinations live in the fixed BottomTabBar.
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout component
 * @see src/components/layout/BottomTabBar.tsx - Primary destinations
 */

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const user = useAuthStore((state) => state.user);
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

  const handleSignOut = async () => {
    await signOutWithToast();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-80 p-0 gap-0 pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)] [&>button]:hidden"
      >
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

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-3 py-2">
            <div className="mb-4">
              <Link
                to="/settings"
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "active:bg-accent active:text-accent-foreground",
                  settingsActive && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <Settings className="h-5 w-5" />
                <span className="flex-1">Settings</span>
                {settingsActive && <div className="h-5 w-1 rounded-full bg-primary" />}
              </Link>
            </div>

            {/* Sign Out */}
            <div className="mb-4">
              <button
                onClick={() => void handleSignOut()}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground"
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
