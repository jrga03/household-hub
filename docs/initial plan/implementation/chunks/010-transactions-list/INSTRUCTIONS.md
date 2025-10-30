# Instructions: Transactions List with Advanced Filtering

Follow these steps in order. Estimated time: 90 minutes.

---

## Step 1: Create Debounced Search Hook (5 min)

Create `src/lib/hooks/useDebounce.ts`:

```typescript
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

---

## Step 2: Update Transaction Query with Filters (15 min)

Update `src/lib/supabaseQueries.ts` to add filter support:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface TransactionFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  accountId?: string;
  categoryId?: string;
  status?: "pending" | "cleared" | null;
  type?: "income" | "expense" | null;
  search?: string;
  excludeTransfers?: boolean;
}

export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(
          `
          *,
          account:accounts(id, name),
          category:categories(id, name, color)
        `
        )
        .order("date", { ascending: false });

      // Apply filters
      if (filters?.dateFrom) {
        query = query.gte("date", filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte("date", filters.dateTo);
      }

      if (filters?.accountId) {
        query = query.eq("account_id", filters.accountId);
      }

      if (filters?.categoryId) {
        query = query.eq("category_id", filters.categoryId);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      if (filters?.type) {
        query = query.eq("type", filters.type);
      }

      if (filters?.search) {
        query = query.or(`description.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
      }

      // CRITICAL: Exclude transfers by default
      if (filters?.excludeTransfers !== false) {
        query = query.is("transfer_group_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}
```

---

## Step 3: Create Filter Form Component (25 min)

Create `src/components/TransactionFilters.tsx`:

```typescript
import { useState } from "react";
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
import type { TransactionFilters } from "@/lib/supabaseQueries";

interface Props {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
}

export function TransactionFilters({ filters, onFiltersChange }: Props) {
  const [searchInput, setSearchInput] = useState(filters.search || "");
  const { data: accounts } = useAccounts();

  // Update filters when search input changes (will be debounced in parent)
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
      excludeTransfers: true, // Keep this default
    });
  };

  const hasActiveFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.accountId ||
    filters.categoryId ||
    filters.status ||
    filters.type ||
    filters.search;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
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

        {/* Date Range */}
        <div className="space-y-2">
          <Label>From Date</Label>
          <DatePicker
            value={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
            onChange={handleDateFromChange}
            placeholder="Start date"
          />
        </div>

        <div className="space-y-2">
          <Label>To Date</Label>
          <DatePicker
            value={filters.dateTo ? new Date(filters.dateTo) : undefined}
            onChange={handleDateToChange}
            placeholder="End date"
          />
        </div>

        {/* Account */}
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

        {/* Category */}
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

        {/* Type */}
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

        {/* Status */}
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={filters.status || "all"}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                status:
                  value === "all" ? null : (value as "pending" | "cleared"),
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

        {/* Exclude Transfers */}
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
```

---

## Step 4: Update Transactions Page with Filters (20 min)

Update `src/routes/transactions.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TransactionList } from "@/components/TransactionList";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import { TransactionFilters } from "@/components/TransactionFilters";
import { useDebounce } from "@/lib/hooks/useDebounce";
import type { TransactionFilters as Filters } from "@/lib/supabaseQueries";

export const Route = createFileRoute("/transactions")({
  component: Transactions,
  validateSearch: (search: Record<string, unknown>): Filters => ({
    dateFrom: (search.dateFrom as string) || undefined,
    dateTo: (search.dateTo as string) || undefined,
    accountId: (search.accountId as string) || undefined,
    categoryId: (search.categoryId as string) || undefined,
    status:
      (search.status as "pending" | "cleared" | null) || null,
    type: (search.type as "income" | "expense" | null) || null,
    search: (search.search as string) || undefined,
    excludeTransfers:
      search.excludeTransfers === "false" ? false : true, // Default true
  }),
});

function Transactions() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Debounce search term to avoid excessive queries
  const debouncedFilters = {
    ...search,
    search: useDebounce(search.search, 300),
  };

  const updateFilters = (newFilters: Filters) => {
    navigate({
      search: (prev) => ({ ...prev, ...newFilters }),
    });
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Transactions</h1>
            <p className="text-sm text-muted-foreground">
              Track your income and expenses
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <TransactionFilters
          filters={search}
          onFiltersChange={updateFilters}
        />

        {/* Transaction List */}
        <TransactionList filters={debouncedFilters} onEdit={handleEdit} />
      </main>

      {/* Form Dialog */}
      <TransactionFormDialog
        open={isFormOpen}
        onClose={handleClose}
        editingId={editingId}
      />
    </div>
  );
}
```

---

## Step 5: Add TypeScript Types (5 min)

Update or create `src/types/transactions.ts`:

```typescript
export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  categoryId?: string;
  status?: "pending" | "cleared" | null;
  type?: "income" | "expense" | null;
  search?: string;
  excludeTransfers?: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  status: "pending" | "cleared";
  account_id: string | null;
  category_id: string | null;
  transfer_group_id: string | null;
  notes: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  // Joined relations
  account?: {
    id: string;
    name: string;
  };
  category?: {
    id: string;
    name: string;
    color: string;
  };
}
```

---

## Step 6: Add Loading and Empty States (10 min)

Update `src/components/TransactionList.tsx` to handle filtered results:

```typescript
// Add to TransactionList component

if (isLoading) {
  return (
    <div className="rounded-lg border bg-card p-8">
      <div className="flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    </div>
  );
}

if (!transactions || transactions.length === 0) {
  const hasFilters =
    filters?.dateFrom ||
    filters?.dateTo ||
    filters?.accountId ||
    filters?.categoryId ||
    filters?.status ||
    filters?.type ||
    filters?.search;

  return (
    <div className="rounded-lg border bg-card p-12 text-center">
      <p className="text-lg font-medium text-muted-foreground">
        {hasFilters
          ? "No transactions match your filters"
          : "No transactions yet"}
      </p>
      {hasFilters && (
        <p className="mt-2 text-sm text-muted-foreground">
          Try adjusting your filters or clear them to see all transactions
        </p>
      )}
    </div>
  );
}
```

---

## Step 7: Add Result Count Display (5 min)

Add a result count above the transaction list in `transactions.tsx`:

```typescript
// After TransactionFilters component
<div className="flex items-center justify-between">
  <div className="text-sm text-muted-foreground">
    {transactions?.length || 0} transactions
  </div>
</div>
```

---

## Step 8: Test Filters (5 min)

1. Start dev server: `npm run dev`
2. Navigate to `/transactions`
3. Test each filter independently
4. Test combinations of filters
5. Verify URL updates with each filter change
6. Test search with debounce
7. Toggle "Hide transfers" and verify behavior

---

## Done!

When all filters work correctly and the URL persists your filter state, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify everything works.

---

## Notes

**CRITICAL**: The `excludeTransfers` filter defaults to `true` to prevent confusing users with transfer transactions appearing as both income and expenses. This is essential for accurate expense tracking.

**Performance**: With proper indexes (see DATABASE.md lines 863-878), filtered queries should return in <50ms even with 10k+ transactions.

**URL State**: Filters in URL allow users to bookmark specific views (e.g., "January expenses for Groceries category").
