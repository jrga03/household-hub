import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { TransactionFiltersPanel } from "@/components/TransactionFilters";
import type { TransactionFilters } from "@/types/transactions";

interface TransactionFilterSheetProps {
  filters: TransactionFilters;
  onFiltersChange: (next: TransactionFilters) => void;
}

export function TransactionFilterSheet({ filters, onFiltersChange }: TransactionFilterSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[320px] sm:w-[380px]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-4 px-4 pb-6 overflow-y-auto">
          <TransactionFiltersPanel filters={filters} onFiltersChange={onFiltersChange} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
