import { Link } from "@tanstack/react-router";
import { LogOut, Menu, User, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useReviewCount } from "@/hooks/useReviewCount";
import { useAuthStore } from "@/stores/authStore";
import { signOutWithToast } from "@/lib/sign-out";
import { cn } from "@/lib/utils";
import { DRAWER_NAV, useIsNavItemActive } from "./nav";
import { ReviewCountBadge, ReviewDot, reviewLabel } from "./ReviewCount";

/**
 * Mobile navigation drawer: every destination off the BottomTabBar, with the
 * signed-in person and sign out pinned to the bottom.
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout component
 * @see src/components/layout/nav.ts - The destinations
 */

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const user = useAuthStore((state) => state.user);
  const reviewCount = useReviewCount();
  const isActive = useIsNavItemActive();

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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-body font-bold">HH</span>
              </div>
              <SheetTitle>Household Hub</SheetTitle>
            </div>
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

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1 px-3 py-2">
            {DRAWER_NAV.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  // Takes the place of the open drawer's history entry, so Back goes to the page before.
                  replace
                  onClick={() => onOpenChange(false)}
                  aria-label={item.reviewCount ? reviewLabel(item.label, reviewCount) : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-body transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "active:bg-accent active:text-accent-foreground",
                    active && "bg-accent text-accent-foreground font-medium"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.reviewCount && <ReviewCountBadge count={reviewCount} />}
                  {active && <div className="h-5 w-1 rounded-full bg-primary" />}
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        <div className="space-y-1 border-t px-3 py-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <User className="h-5 w-5" />
            </div>
            <span className="min-w-0 truncate text-body text-muted-foreground">{user?.email}</span>
          </div>
          <button
            onClick={() => void handleSignOut()}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-3 text-body transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground"
          >
            <LogOut className="h-5 w-5" />
            <span className="flex-1 text-left">Sign Out</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The hamburger, with a dot while anything waits for review. */
export function NavMenuButton({ onClick }: { onClick: () => void }) {
  const reviewCount = useReviewCount();
  const label =
    reviewCount > 0 ? `Open navigation menu, ${reviewCount} to review` : "Open navigation menu";

  return (
    <Button variant="ghost" size="icon" className="relative" onClick={onClick} aria-label={label}>
      <Menu className="h-5 w-5" />
      <ReviewDot />
    </Button>
  );
}
