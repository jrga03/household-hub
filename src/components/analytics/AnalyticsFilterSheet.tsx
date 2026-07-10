import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { FilterPanel, type FilterPanelProps } from "./FilterPanel";

interface AnalyticsFilterSheetProps extends FilterPanelProps {
  /**
   * Controlled open state (owned by the route) so the shared Sheet wrapper's
   * back-gesture handling can close this sheet — uncontrolled Radix state is
   * invisible to it (review R37).
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra classes for the trigger button (e.g. container-query visibility) */
  triggerClassName?: string;
}

/**
 * Bottom-sheet mount for the analytics FilterPanel on narrow layouts
 * (review R8). Mirrors TransactionFilterSheet's structure; `side="bottom"`
 * is a deliberate deviation for thumb reach. The SAME FilterPanel component
 * renders here and inline on wide layouts — do not fork it.
 *
 * SheetContent unmounts on close, so each open mounts a fresh FilterPanel
 * seeded from `initialValues` (the route's currently-applied filters) —
 * reopening always shows what is actually applied, and Apply can't wipe
 * filters applied earlier (via either mount).
 */
export function AnalyticsFilterSheet({
  onFilterChange,
  initialValues,
  accounts,
  categories,
  open,
  onOpenChange,
  triggerClassName,
}: AnalyticsFilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={triggerClassName}>
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-[var(--safe-area-bottom)]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <FilterPanel
            onFilterChange={(next) => {
              onFilterChange(next);
              // Applying (or clearing) filters dismisses the sheet so the
              // updated dashboard is immediately visible.
              onOpenChange(false);
            }}
            initialValues={initialValues}
            accounts={accounts}
            categories={categories}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
