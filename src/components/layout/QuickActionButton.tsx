import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavStore } from "@/stores/navStore";
import { cn } from "@/lib/utils";

/**
 * Floating Action Button (FAB) for mobile
 *
 * Single action: one tap opens the quick-add transaction dialog by setting
 * navStore's `quickAddOpen` flag — the same path MobileNav's "Add Transaction"
 * CTA uses. The dialog itself is mounted once by AppLayout's
 * QuickAddTransactionDialog, which consumes that flag.
 *
 * Features:
 * - Fixed position bottom-right, raised 1.5rem above the bottom chrome
 *   (--bottom-chrome, index.css): on phones that is the BottomTabBar
 *   footprint (review R42), on tablet/desktop just the safe area — so the
 *   FAB never sits on the tab bar and keeps its old position elsewhere
 * - Shadow for depth perception
 * - Scale animation on press
 * - Z-index management to stay above content
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout + dialog mount
 */

interface QuickActionButtonProps {
  className?: string;
  hideOnRoutes?: string[]; // Routes where FAB should be hidden
}

export function QuickActionButton({
  className,
  hideOnRoutes = ["/login", "/signup"],
}: QuickActionButtonProps) {
  const setQuickAddOpen = useNavStore((state) => state.setQuickAddOpen);

  // Check if we should hide the FAB on current route
  const currentPath = window.location.pathname;
  const shouldHide = hideOnRoutes.some((route) => currentPath.startsWith(route));

  if (shouldHide) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-[calc(1.5rem+var(--bottom-chrome))] right-[calc(1.5rem+var(--safe-area-right))] z-50",
        className
      )}
    >
      <Button
        size="lg"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg",
          "bg-primary hover:bg-primary/90",
          "transition-all duration-200",
          "active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        )}
        onClick={() => setQuickAddOpen(true)}
        aria-label="Add transaction"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
