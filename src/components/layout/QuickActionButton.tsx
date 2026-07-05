import { useState } from "react";
import { Plus, CreditCard, Tags, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import { cn } from "@/lib/utils";
import { getShortcutKey } from "@/hooks/useKeyboardShortcuts";

/**
 * Floating Action Button (FAB) for mobile quick actions
 *
 * Primary action: Add Transaction (single tap)
 * Secondary actions: Add Account, Add Category (long press / hold)
 *
 * Features:
 * - Fixed position bottom-right
 * - Shadow for depth perception
 * - Scale animation on tap
 * - Long-press menu for additional actions
 * - Z-index management to stay above content
 *
 * @see src/components/layout/AppLayout.tsx - Parent layout component
 */

interface QuickActionButtonProps {
  className?: string;
  hideOnRoutes?: string[]; // Routes where FAB should be hidden
}

export function QuickActionButton({
  className,
  hideOnRoutes = ["/login", "/signup"],
}: QuickActionButtonProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  // Check if we should hide the FAB on current route
  const currentPath = window.location.pathname;
  const shouldHide = hideOnRoutes.some((route) => currentPath.startsWith(route));

  if (shouldHide) {
    return null;
  }

  const handleMainAction = () => {
    if (!dropdownOpen) {
      setTransactionDialogOpen(true);
    }
  };

  const handleAddAccount = () => {
    setDropdownOpen(false);
    setAccountDialogOpen(true);
  };

  const handleAddCategory = () => {
    setDropdownOpen(false);
    setCategoryDialogOpen(true);
  };

  return (
    <>
      {/* Floating Action Button */}
      <div
        className={cn(
          "fixed bottom-[calc(1.5rem+var(--safe-area-bottom))] right-[calc(1.5rem+var(--safe-area-right))] z-50",
          className
        )}
      >
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className={cn(
                "h-14 w-14 rounded-full shadow-lg",
                "bg-primary hover:bg-primary/90",
                "transition-all duration-200",
                "active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              )}
              onClick={handleMainAction}
              onContextMenu={(e) => {
                e.preventDefault();
                setDropdownOpen(true);
              }}
              title={`Add Transaction (${getShortcutKey("N", true)})`}
            >
              {dropdownOpen ? (
                <X className="h-6 w-6 transition-transform duration-200" />
              ) : (
                <Plus className="h-6 w-6 transition-transform duration-200" />
              )}
              <span className="sr-only">Quick Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={16} className="w-48">
            <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setDropdownOpen(false);
                setTransactionDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Transaction
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddAccount}>
              <CreditCard className="mr-2 h-4 w-4" />
              Add Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddCategory}>
              <Tags className="mr-2 h-4 w-4" />
              Add Category
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Transaction Dialog */}
      <TransactionFormDialog
        open={transactionDialogOpen}
        onClose={() => setTransactionDialogOpen(false)}
      />

      {/* Account Dialog (placeholder - implement when AccountFormDialog exists) */}
      {accountDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Add Account</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Account creation dialog coming soon
            </p>
            <Button onClick={() => setAccountDialogOpen(false)}>Close</Button>
          </div>
        </div>
      )}

      {/* Category Dialog (placeholder - implement when CategoryFormDialog exists) */}
      {categoryDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Add Category</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Category creation dialog coming soon
            </p>
            <Button onClick={() => setCategoryDialogOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </>
  );
}
