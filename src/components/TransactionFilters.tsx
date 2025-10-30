import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import type { TransactionFilters as FilterCriteria } from "@/types/transactions";

interface TransactionFiltersProps {
  filters: FilterCriteria;
  onFiltersChange: (filters: FilterCriteria) => void;
}

/**
 * Transaction Filters Component
 *
 * Provides comprehensive filtering UI for the transactions list:
 * - Search (debounced in parent)
 * - Date range (from/to)
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
  // Local state for search input to provide immediate visual feedback
  // Actual debouncing happens in parent component
  const [searchInput, setSearchInput] = useState(() => filters.search || "");
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

  const clearFilters = () => {
    setSearchInput("");
    onFiltersChange({
      excludeTransfers: true, // CRITICAL: Keep default to hide transfers
    });
  };

  // Determine if any filters are active (for showing Clear button)
  const hasActiveFilters = hasActiveTransactionFilters(filters);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Filters</h3>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Filter Controls Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Search */}
        <div className="space-y-2">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

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
        <div className="flex items-center space-x-2 pt-6">
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
    </div>
  );
}
