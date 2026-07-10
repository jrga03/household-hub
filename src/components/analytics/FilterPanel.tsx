import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";

export interface AnalyticsFilterValues {
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense";
  startDate: Date;
  endDate: Date;
}

export interface FilterPanelProps {
  /**
   * Called with the COMPLETE filter set on Apply/Clear. Because drafts are
   * seeded from `initialValues`, owners should REPLACE their applied state
   * with this value (not merge it) — untouched fields already carry the
   * currently-applied values.
   */
  onFilterChange: (filters: AnalyticsFilterValues) => void;
  /**
   * The currently-APPLIED filters. Drafts seed from this on mount and re-seed
   * whenever it changes by value, so every mount of this panel (inline rail
   * and bottom sheet) always reflects the applied state (review R8 follow-up).
   */
  initialValues: AnalyticsFilterValues;
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}

/** Stable value-key for a filter set; detects applied-filter changes. */
function filterSeedKey(values: AnalyticsFilterValues): string {
  return [
    values.startDate.getTime(),
    values.endDate.getTime(),
    values.accountId ?? "",
    values.categoryId ?? "",
    values.type ?? "",
  ].join("|");
}

export function FilterPanel({
  onFilterChange,
  initialValues,
  accounts,
  categories,
}: FilterPanelProps) {
  const [startDate, setStartDate] = useState<Date>(initialValues.startDate);
  const [endDate, setEndDate] = useState<Date>(initialValues.endDate);
  const [accountId, setAccountId] = useState<string>(initialValues.accountId ?? "all");
  const [categoryId, setCategoryId] = useState<string>(initialValues.categoryId ?? "all");
  const [type, setType] = useState<"income" | "expense" | "all">(initialValues.type ?? "all");

  // Re-seed drafts whenever the APPLIED filters change by value (React's
  // "adjust state during render" pattern). This keeps the inline mount and the
  // sheet mount in lockstep without call sites having to key/remount the
  // panel: reopening the sheet shows the applied values, and Apply emits the
  // full set seeded from applied state, so it never silently wipes fields the
  // user didn't touch. Value comparison (not object identity) means a parent
  // re-render with an equal filters object can't clobber in-progress drafts.
  const seedKey = filterSeedKey(initialValues);
  const [lastSeedKey, setLastSeedKey] = useState(seedKey);
  if (lastSeedKey !== seedKey) {
    setLastSeedKey(seedKey);
    setStartDate(initialValues.startDate);
    setEndDate(initialValues.endDate);
    setAccountId(initialValues.accountId ?? "all");
    setCategoryId(initialValues.categoryId ?? "all");
    setType(initialValues.type ?? "all");
  }

  const handleApplyFilters = () => {
    onFilterChange({
      accountId: accountId === "all" ? undefined : accountId,
      categoryId: categoryId === "all" ? undefined : categoryId,
      type: type === "all" ? undefined : type,
      startDate,
      endDate,
    });
  };

  const handleClearFilters = () => {
    setAccountId("all");
    setCategoryId("all");
    setType("all");
    setStartDate(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1));
    setEndDate(new Date());
    // Emits the default range with no entity filters; because owners REPLACE
    // their applied state with this, Clear genuinely clears everything.
    onFilterChange({
      startDate: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1),
      endDate: new Date(),
    });
  };

  return (
    <Card className="@container">
      <CardContent className="pt-6">
        <div className="grid gap-4 @[600px]:grid-cols-5">
          {/* Date Range */}
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => d && setStartDate(d)}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>End Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(endDate, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Account Filter */}
          <div className="space-y-2">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type Filter */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "income" | "expense" | "all")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <Button onClick={handleApplyFilters} className="flex-1">
            Apply Filters
          </Button>
          <Button onClick={handleClearFilters} variant="outline">
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
