import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, subDays } from "date-fns";
import { Search, X, Filter, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useMediaQuery";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CategorySelector } from "@/components/ui/category-selector";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAccounts } from "@/lib/supabaseQueries";
import { hasActiveTransactionFilters } from "@/lib/utils/filters";
import { parsePHP, formatPHP } from "@/lib/currency";
import type { TransactionFilters as FilterCriteria } from "@/types/transactions";

interface TransactionFiltersProps {
  filters: FilterCriteria;
  onFiltersChange: (filters: FilterCriteria) => void;
}

/**
 * Quick date preset options
 */
type DatePreset = "this-month" | "last-month" | "last-30-days" | "this-year";

/**
 * Transaction Filters Component
 *
 * Provides comprehensive filtering UI for the transactions list:
 * - Search (debounced in parent)
 * - Date range (from/to) with quick presets
 * - Amount range (min/max)
 * - Account selector
 * - Category selector (hierarchical)
 * - Type filter (income/expense/all)
 * - Status filter (pending/cleared/all)
 * - Transfer exclusion toggle (default: ON)
 *
 * All filter state is managed in the URL via the parent component,
 * making filter combinations bookmarkable and shareable.
 */
export function TransactionFilters({ filters, onFiltersChange }: TransactionFiltersProps) {
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  // Local state for search input to provide immediate visual feedback
  // Actual debouncing happens in parent component
  const [searchInput, setSearchInput] = useState(() => filters.search || "");

  // Local state for amount inputs (as formatted PHP strings)
  const [amountMinInput, setAmountMinInput] = useState(() =>
    filters.amountMin ? formatPHP(filters.amountMin) : ""
  );
  const [amountMaxInput, setAmountMaxInput] = useState(() =>
    filters.amountMax ? formatPHP(filters.amountMax) : ""
  );

  const { data: accounts } = useAccounts();

  // Sync local search state when parent filters change externally via useEffect
  // Only updates when filters.search changes and differs from current input
  useEffect(() => {
    // Only update if the filter changed externally (not from our own input)
    if (filters.search !== searchInput) {
      setSearchInput(filters.search || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    onFiltersChange({ ...filters, search: value });
  };

  const handleDateFromChange = (date: Date | undefined) => {
    onFiltersChange({
      ...filters,
      dateFrom: date ? format(date, "yyyy-MM-dd") : undefined,
    });
  };

  const handleDateToChange = (date: Date | undefined) => {
    onFiltersChange({
      ...filters,
      dateTo: date ? format(date, "yyyy-MM-dd") : undefined,
    });
  };

  const handleAmountMinChange = (value: string) => {
    setAmountMinInput(value);
    try {
      const cents = value ? parsePHP(value) : undefined;
      onFiltersChange({ ...filters, amountMin: cents });
    } catch {
      // Invalid input, don't update filter
    }
  };

  const handleAmountMaxChange = (value: string) => {
    setAmountMaxInput(value);
    try {
      const cents = value ? parsePHP(value) : undefined;
      onFiltersChange({ ...filters, amountMax: cents });
    } catch {
      // Invalid input, don't update filter
    }
  };

  const applyDatePreset = (preset: DatePreset) => {
    const today = new Date();
    let dateFrom: Date;
    let dateTo: Date;

    switch (preset) {
      case "this-month":
        dateFrom = startOfMonth(today);
        dateTo = endOfMonth(today);
        break;
      case "last-month":
        dateFrom = startOfMonth(subMonths(today, 1));
        dateTo = endOfMonth(subMonths(today, 1));
        break;
      case "last-30-days":
        dateFrom = subDays(today, 30);
        dateTo = today;
        break;
      case "this-year":
        dateFrom = startOfYear(today);
        dateTo = today;
        break;
    }

    onFiltersChange({
      ...filters,
      dateFrom: format(dateFrom, "yyyy-MM-dd"),
      dateTo: format(dateTo, "yyyy-MM-dd"),
    });
  };

  const clearFilters = () => {
    setSearchInput("");
    setAmountMinInput("");
    setAmountMaxInput("");
    onFiltersChange({
      excludeTransfers: true, // CRITICAL: Keep default to hide transfers
    });
  };

  // Determine if any filters are active (for showing Clear button)
  const hasActiveFilters = hasActiveTransactionFilters(filters);

  // Count active filters for the mobile badge
  const activeFilterCount = [
    filters.dateFrom,
    filters.dateTo,
    filters.accountId,
    filters.categoryId,
    filters.type,
    filters.status,
    filters.amountMin,
    filters.amountMax,
    filters.excludeTransfers === false ? true : undefined,
  ].filter(Boolean).length;

  // On desktop, always show expanded. On mobile, use toggle state.
  const showFilters = !isMobile || isExpanded;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      {/* Header + Always-visible Search */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Filters</h3>
          {isMobile && activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Search - always visible */}
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Collapsible filter section */}
      {showFilters && (
        <>
          {/* Quick Date Presets */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDatePreset("this-month")}
              className="gap-1"
            >
              <Calendar className="h-3 w-3" />
              This Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDatePreset("last-month")}
              className="gap-1"
            >
              <Calendar className="h-3 w-3" />
              Last Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDatePreset("last-30-days")}
              className="gap-1"
            >
              <Calendar className="h-3 w-3" />
              Last 30 Days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDatePreset("this-year")}
              className="gap-1"
            >
              <Calendar className="h-3 w-3" />
              This Year
            </Button>
          </div>

          {/* Filter Controls Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Date Range - From */}
            <div className="space-y-2">
              <Label>From Date</Label>
              <DatePicker
                value={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                onChange={handleDateFromChange}
                placeholder="Start date"
              />
            </div>

            {/* Date Range - To */}
            <div className="space-y-2">
              <Label>To Date</Label>
              <DatePicker
                value={filters.dateTo ? new Date(filters.dateTo) : undefined}
                onChange={handleDateToChange}
                placeholder="End date"
              />
            </div>

            {/* Amount Range - Min */}
            <div className="space-y-2">
              <Label>Min Amount</Label>
              <Input
                type="text"
                placeholder="₱0.00"
                value={amountMinInput}
                onChange={(e) => handleAmountMinChange(e.target.value)}
              />
            </div>

            {/* Amount Range - Max */}
            <div className="space-y-2">
              <Label>Max Amount</Label>
              <Input
                type="text"
                placeholder="₱999,999.99"
                value={amountMaxInput}
                onChange={(e) => handleAmountMaxChange(e.target.value)}
              />
            </div>

            {/* Account Filter */}
            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                value={filters.accountId || "all"}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    accountId: value === "all" ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="space-y-2">
              <Label>Category</Label>
              <CategorySelector
                value={filters.categoryId}
                onChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    categoryId: value || undefined,
                  })
                }
                placeholder="All categories"
              />
            </div>

            {/* Type Filter */}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={filters.type || "all"}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    type: value === "all" ? null : (value as "income" | "expense"),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.status || "all"}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    status: value === "all" ? null : (value as "pending" | "cleared"),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cleared">Cleared</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Transfer Exclusion Toggle */}
            <div className="flex items-center space-x-2 md:pt-6">
              <Switch
                id="exclude-transfers"
                checked={filters.excludeTransfers !== false}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    ...filters,
                    excludeTransfers: checked,
                  })
                }
              />
              <Label htmlFor="exclude-transfers" className="cursor-pointer">
                Hide transfers
              </Label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
