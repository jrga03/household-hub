import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { Account, AccountInsert, AccountUpdate } from "@/types/accounts";
import type {
  Category,
  CategoryInsert,
  CategoryUpdate,
  CategoryWithChildren,
} from "@/types/categories";
import type {
  Transaction,
  TransactionInsert,
  TransactionUpdate,
  TransactionFilters,
  TransactionWithRelations,
} from "@/types/transactions";

/**
 * TanStack Query hooks for accounts CRUD operations
 * See instructions.md Step 2 for full specification
 */

// Fetch all active accounts
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as Account[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create account
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (account: AccountInsert) => {
      const { data, error } = await supabase.from("accounts").insert(account).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Update account
export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: AccountUpdate }) => {
      const { data, error } = await supabase
        .from("accounts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Archive account (soft delete)
export function useArchiveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").update({ is_active: false }).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

/**
 * TanStack Query hooks for account balance calculations
 * CRITICAL: Include ALL transactions (including transfers) for accurate balances
 *
 * Balance calculation differs from analytics:
 * - Analytics: Exclude transfers (to avoid double-counting income/expenses)
 * - Balances: Include transfers (they affect account totals)
 */

/**
 * Account balance breakdown with cleared/pending separation
 */
export interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalance: number; // Initial balance in cents
  currentBalance: number; // Initial + all transactions (cleared + pending)
  clearedBalance: number; // Initial + cleared transactions only
  pendingBalance: number; // Sum of pending transactions only (can be +/-)
  transactionCount: number; // Total number of transactions
  clearedCount: number; // Number of cleared transactions
  pendingCount: number; // Number of pending transactions
}

/**
 * Fetches balance breakdown for a single account.
 *
 * CRITICAL: Includes ALL transactions (including transfers) because transfers
 * affect account balances. This differs from analytics queries which exclude
 * transfers to prevent double-counting.
 *
 * Balance Calculation:
 * - Income transactions: Add amount_cents to balance
 * - Expense transactions: Subtract amount_cents from balance
 * - Cleared balance: initial_balance + cleared transactions only
 * - Pending balance: sum of pending transactions (separate calculation)
 * - Current balance: initial_balance + all transactions (cleared + pending)
 *
 * @param accountId - The account ID to calculate balance for
 * @returns Query result with AccountBalance interface
 *
 * @example
 * const { data: balance, isLoading } = useAccountBalance("account-123");
 * // Returns:
 * // {
 * //   accountId: "account-123",
 * //   accountName: "BDO Checking",
 * //   initialBalance: 1000000, // ₱10,000.00
 * //   currentBalance: 850000,  // ₱8,500.00
 * //   clearedBalance: 900000,  // ₱9,000.00
 * //   pendingBalance: -50000,  // -₱500.00
 * //   transactionCount: 25,
 * //   clearedCount: 20,
 * //   pendingCount: 5
 * // }
 */
export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ["account-balance", accountId],
    queryFn: async (): Promise<AccountBalance> => {
      // Fetch account details
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("id, name, initial_balance_cents")
        .eq("id", accountId)
        .single();

      if (accountError) throw accountError;
      if (!account) throw new Error("Account not found");

      // Fetch ALL transactions for this account
      // CRITICAL: Do NOT filter out transfers - they affect account balances
      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("amount_cents, type, status")
        .eq("account_id", accountId);

      if (transactionsError) throw transactionsError;

      // Initialize balance accumulators
      let clearedBalanceDelta = 0;
      let pendingBalanceDelta = 0;
      let clearedCount = 0;
      let pendingCount = 0;

      // Calculate balance deltas using integer cent arithmetic
      transactions?.forEach((t) => {
        // Income adds to balance, expense subtracts from balance
        const delta = t.type === "income" ? t.amount_cents : -t.amount_cents;

        if (t.status === "cleared") {
          clearedBalanceDelta += delta;
          clearedCount++;
        } else {
          pendingBalanceDelta += delta;
          pendingCount++;
        }
      });

      const initialBalance = account.initial_balance_cents || 0;

      return {
        accountId: account.id,
        accountName: account.name,
        initialBalance,
        currentBalance: initialBalance + clearedBalanceDelta + pendingBalanceDelta,
        clearedBalance: initialBalance + clearedBalanceDelta,
        pendingBalance: pendingBalanceDelta, // Can be positive or negative
        transactionCount: transactions?.length || 0,
        clearedCount,
        pendingCount,
      };
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetches balance breakdowns for ALL active accounts.
 *
 * CRITICAL: Includes ALL transactions (including transfers) in balance calculations.
 * Efficiently fetches all accounts and transactions in two queries, then performs
 * client-side aggregation grouped by account_id.
 *
 * Use Cases:
 * - Dashboard account summary cards
 * - Net worth calculation (sum of all balances)
 * - Account comparison views
 * - Budget vs available funds checks
 *
 * @returns Query result with AccountBalance[] array
 *
 * @example
 * const { data: balances, isLoading } = useAccountBalances();
 * // Returns array of balances for all active accounts, ordered by name
 */
export function useAccountBalances() {
  return useQuery({
    queryKey: ["account-balances"],
    queryFn: async (): Promise<AccountBalance[]> => {
      // Fetch all active accounts
      const { data: accounts, error: accountsError } = await supabase
        .from("accounts")
        .select("id, name, initial_balance_cents")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (accountsError) throw accountsError;
      if (!accounts || accounts.length === 0) return [];

      // Fetch transactions for active accounts only (performance optimization)
      // CRITICAL: Include transfers for accurate balances
      const accountIds = accounts.map((a) => a.id);
      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("account_id, amount_cents, type, status")
        .in("account_id", accountIds);

      if (transactionsError) throw transactionsError;

      // Group transactions by account_id and calculate balances
      const balanceMap = new Map<
        string,
        {
          clearedDelta: number;
          pendingDelta: number;
          clearedCount: number;
          pendingCount: number;
        }
      >();

      // Initialize map with all accounts (even those with no transactions)
      accounts.forEach((account) => {
        balanceMap.set(account.id, {
          clearedDelta: 0,
          pendingDelta: 0,
          clearedCount: 0,
          pendingCount: 0,
        });
      });

      // Aggregate transaction deltas by account
      transactions?.forEach((t) => {
        if (!t.account_id) return; // Skip transactions without account

        const existing = balanceMap.get(t.account_id);
        if (!existing) return; // Skip transactions for inactive accounts

        // Income adds to balance, expense subtracts from balance
        const delta = t.type === "income" ? t.amount_cents : -t.amount_cents;

        if (t.status === "cleared") {
          existing.clearedDelta += delta;
          existing.clearedCount++;
        } else {
          existing.pendingDelta += delta;
          existing.pendingCount++;
        }
      });

      // Build AccountBalance array
      return accounts.map((account) => {
        const balances = balanceMap.get(account.id)!;
        const initialBalance = account.initial_balance_cents || 0;

        return {
          accountId: account.id,
          accountName: account.name,
          initialBalance,
          currentBalance: initialBalance + balances.clearedDelta + balances.pendingDelta,
          clearedBalance: initialBalance + balances.clearedDelta,
          pendingBalance: balances.pendingDelta,
          transactionCount: balances.clearedCount + balances.pendingCount,
          clearedCount: balances.clearedCount,
          pendingCount: balances.pendingCount,
        };
      });
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * TanStack Query hooks for categories CRUD operations
 */

// Fetch all categories
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Category[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (categories change rarely)
  });
}

// Fetch categories grouped by parent
export function useCategoriesGrouped() {
  return useQuery({
    queryKey: ["categories", "grouped"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const categories = data as Category[];

      // Group by parent_id - filter parents first, then add children
      const grouped = categories
        .filter((c) => c.parent_id === null)
        .map((parent) => ({
          ...parent,
          children: categories.filter((c) => c.parent_id === parent.id),
        }));

      return grouped as CategoryWithChildren[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Create category
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category: CategoryInsert) => {
      const { data, error } = await supabase.from("categories").insert(category).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// Update category
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: CategoryUpdate }) => {
      const { data, error } = await supabase
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// Archive category (soft delete)
export function useArchiveCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").update({ is_active: false }).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

/**
 * TanStack Query hooks for transactions CRUD operations
 * CRITICAL: Always invalidate both ["transactions"] and ["accounts"] on mutations
 * to keep account balances in sync
 */

// Fetch transactions with filters
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
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      // Apply filters (convert camelCase to snake_case for database)
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

      // Amount range filtering
      if (filters?.amountMin !== undefined) {
        query = query.gte("amount_cents", filters.amountMin);
      }

      if (filters?.amountMax !== undefined) {
        query = query.lte("amount_cents", filters.amountMax);
      }

      // Full-text search on description and notes (case-insensitive)
      if (filters?.search) {
        query = query.or(`description.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
      }

      // CRITICAL: Exclude transfers by default (unless explicitly set to false)
      if (filters?.excludeTransfers !== false) {
        query = query.is("transfer_group_id", null);
      }

      const { data, error } = await query.limit(100); // Pagination later

      if (error) throw error;
      return data as TransactionWithRelations[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Fetch single transaction
export function useTransaction(id: string) {
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `
          *,
          account:accounts(id, name),
          category:categories(id, name, color)
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as TransactionWithRelations;
    },
  });
}

// Create transaction
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: TransactionInsert) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert(transaction)
        .select()
        .single();

      if (error) throw error;
      return data as Transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] }); // Balance updated
    },
  });
}

// Update transaction
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TransactionUpdate }) => {
      const { data, error } = await supabase
        .from("transactions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Delete transaction
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Toggle status (pending ↔ cleared)
export function useToggleTransactionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch current status with proper error handling
      const { data: current, error: fetchError } = await supabase
        .from("transactions")
        .select("status")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError; // Throw actual error (RLS, network, etc.)
      if (!current) throw new Error("Transaction not found");

      const newStatus = current.status === "pending" ? "cleared" : "pending";

      const { error: updateError } = await supabase
        .from("transactions")
        .update({ status: newStatus })
        .eq("id", id);

      if (updateError) throw updateError;

      return newStatus; // Return new status for optimistic updates
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

/**
 * TanStack Query hooks for category totals analytics
 * CRITICAL: Always exclude transfers from analytics calculations
 */

import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";

/**
 * Individual category total with expense/income breakdown
 */
export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  parentName: string | null;
  color: string;
  expenseCents: number;
  incomeCents: number;
  transactionCount: number;
  percentOfTotal: number;
}

/**
 * Parent category group with children rollup
 */
export interface CategoryTotalGroup {
  parentId: string | null;
  parentName: string;
  parentColor: string;
  totalExpenseCents: number;
  children: CategoryTotal[];
  // Note: Child categories track incomeCents, but MVP displays expense-focused analytics only.
  // Income analysis can be added in Phase B by utilizing the incomeCents field.
}

/**
 * Fetches category totals for a specific month with parent/child hierarchy.
 *
 * CRITICAL: Excludes transfers from calculations using `.is("transfer_group_id", null)`.
 * Transfers are account movements, not actual income or expenses, and would cause
 * double-counting if included in analytics.
 *
 * **Caching Strategy**: Uses adaptive caching based on whether the month is current or historical:
 * - Current month: 1 minute cache (data changes frequently as transactions are added)
 * - Historical months: 10 minutes cache (rarely change unless transactions are edited)
 *
 * @param month - The month to calculate totals for (Date object)
 * @param options - Optional configuration for query behavior
 * @param options.staleTime - Override default cache duration (milliseconds)
 * @returns Query result with CategoryTotalGroup[] sorted by expense (highest first)
 *
 * @example
 * // Use default adaptive caching
 * const { data: totals } = useCategoryTotals(new Date(2024, 0, 1));
 *
 * @example
 * // Override cache duration
 * const { data: totals } = useCategoryTotals(new Date(2024, 0, 1), { staleTime: 5000 });
 */
export function useCategoryTotals(month: Date, options?: { staleTime?: number }) {
  // Adaptive caching: Historical months can be cached longer since they rarely change
  const isCurrentMonth = format(month, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const defaultStaleTime = isCurrentMonth
    ? 60 * 1000 // 1 minute for current month (frequent updates expected)
    : 10 * 60 * 1000; // 10 minutes for historical months (rarely change)

  return useQuery({
    queryKey: ["category-totals", format(month, "yyyy-MM")],
    queryFn: async (): Promise<CategoryTotalGroup[]> => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      // Fetch all active categories with hierarchy
      const { data: categories, error: categoriesError } = await supabase
        .from("categories")
        .select("id, name, parent_id, color")
        .eq("is_active", true)
        .order("sort_order");

      if (categoriesError) throw categoriesError;
      if (!categories) return [];

      // Fetch transactions for this month
      // CRITICAL: Exclude transfers from analytics to prevent double-counting
      // Transfers are movements between accounts, not actual income/expenses
      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("category_id, amount_cents, type")
        .is("transfer_group_id", null) // ← CRITICAL: Exclude transfers
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (transactionsError) throw transactionsError;

      // Build category totals map (by category_id)
      const totalsMap = new Map<
        string,
        {
          expense: number;
          income: number;
          count: number;
        }
      >();

      // Aggregate transactions by category
      transactions?.forEach((t) => {
        if (!t.category_id) return; // Skip uncategorized

        const existing = totalsMap.get(t.category_id) || {
          expense: 0,
          income: 0,
          count: 0,
        };

        if (t.type === "expense") {
          existing.expense += t.amount_cents;
        } else if (t.type === "income") {
          existing.income += t.amount_cents;
        }
        existing.count++;

        totalsMap.set(t.category_id, existing);
      });

      // Calculate total spending across all categories for percentages
      const totalSpending = Array.from(totalsMap.values()).reduce((sum, t) => sum + t.expense, 0);

      // Group categories by parent (two-level hierarchy)
      const parentMap = new Map<string | null, CategoryTotalGroup>();

      categories.forEach((category) => {
        // Skip parent categories in transaction processing
        // Parent categories are group headers only - transactions go to children
        if (!category.parent_id) {
          // Initialize parent group (even if no children have transactions yet)
          if (!parentMap.has(category.id)) {
            parentMap.set(category.id, {
              parentId: category.id,
              parentName: category.name,
              parentColor: category.color,
              totalExpenseCents: 0,
              children: [],
            });
          }
          return;
        }

        // This is a child category - aggregate its totals
        const totals = totalsMap.get(category.id) || {
          expense: 0,
          income: 0,
          count: 0,
        };

        const parent = categories.find((c) => c.id === category.parent_id);
        const parentKey = category.parent_id;

        // Ensure parent group exists (create if not initialized above)
        if (!parentMap.has(parentKey)) {
          parentMap.set(parentKey, {
            parentId: parentKey,
            parentName: parent?.name || "Uncategorized",
            parentColor: parent?.color || "#6B7280",
            totalExpenseCents: 0,
            children: [],
          });
        }

        const group = parentMap.get(parentKey)!;
        group.totalExpenseCents += totals.expense;
        group.children.push({
          categoryId: category.id,
          categoryName: category.name,
          parentId: category.parent_id,
          parentName: parent?.name || null,
          color: category.color,
          expenseCents: totals.expense,
          incomeCents: totals.income,
          transactionCount: totals.count,
          percentOfTotal: totalSpending > 0 ? (totals.expense / totalSpending) * 100 : 0,
        });
      });

      // Convert map to array, filter out empty groups, and sort by total expense (highest first)
      return (
        Array.from(parentMap.values())
          .filter((group) => group.children.length > 0) // Only show parents with children
          // NOTE: Parents without ANY child categories (not just zero transactions) are also excluded.
          // This is intentional per schema constraint: transactions must be assigned to child categories only.
          // A parent with defined children but zero transactions will show with ₱0.00 totals.
          .sort((a, b) => b.totalExpenseCents - a.totalExpenseCents)
      );
    },
    staleTime: options?.staleTime ?? defaultStaleTime,
  });
}

/**
 * Fetches category totals for two months for comparison (current vs previous).
 *
 * Useful for showing month-over-month spending trends in analytics UI.
 * Returns both query results plus a combined loading state.
 *
 * @param currentMonth - The current month to display
 * @param previousMonth - The previous month for comparison
 * @returns Object with current, previous queries and combined loading state
 *
 * @example
 * const { current, previous, isLoading } = useCategoryTotalsComparison(
 *   new Date(2024, 0, 1),  // January 2024
 *   new Date(2023, 11, 1)  // December 2023
 * );
 */
export function useCategoryTotalsComparison(currentMonth: Date, previousMonth: Date) {
  const current = useCategoryTotals(currentMonth);
  const previous = useCategoryTotals(previousMonth);

  return {
    current,
    previous,
    isLoading: current.isLoading || previous.isLoading,
  };
}

/**
 * TanStack Query hook for dashboard data aggregation
 * CRITICAL: Excludes transfers from income/expense analytics
 * but INCLUDES transfers in balance calculations
 */

/**
 * Dashboard data interface with all metrics and visualizations
 */
export interface DashboardData {
  summary: {
    totalIncomeCents: number;
    totalExpenseCents: number;
    netAmountCents: number;
    transactionCount: number;
    accountCount: number;
    totalBalanceCents: number;
    previousMonthIncomeCents: number;
    previousMonthExpenseCents: number;
    // Enhanced metrics (per DATABASE.md Monthly Summary Query spec)
    activeDays: number; // COUNT(DISTINCT date)
    uniqueCategories: number; // COUNT(DISTINCT category_id)
    clearedCount: number; // Cleared transaction count
    pendingCount: number; // Pending transaction count
  };
  monthlyTrend: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
  }>;
  categoryBreakdown: Array<{
    categoryId: string; // For click navigation to filtered transactions
    categoryName: string;
    color: string;
    amountCents: number;
    percentOfTotal: number;
  }>;
  recentTransactions: TransactionWithRelations[];
}

/**
 * Fetches all dashboard data in a single optimized query.
 *
 * CRITICAL Transfer Handling:
 * - Analytics (income/expense/category): EXCLUDE transfers (`.is("transfer_group_id", null)`)
 * - Balances: INCLUDE transfers (they affect account balances)
 *
 * Caching: 30 seconds (balance between freshness and performance)
 *
 * @param currentMonth - The month to display dashboard for
 * @returns Query result with DashboardData interface
 *
 * @example
 * const { data, isLoading } = useDashboardData(startOfMonth(new Date()));
 */
export function useDashboardData(currentMonth: Date) {
  return useQuery({
    queryKey: ["dashboard", format(currentMonth, "yyyy-MM")],
    queryFn: async (): Promise<DashboardData> => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const previousMonthStart = startOfMonth(subMonths(currentMonth, 1));
      const previousMonthEnd = endOfMonth(subMonths(currentMonth, 1));

      // 1. Fetch current month transactions (exclude transfers)
      const { data: currentTransactions, error: currentError } = await supabase
        .from("transactions")
        .select("id, amount_cents, type, category_id, status, date")
        .is("transfer_group_id", null) // Exclude transfers
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (currentError) throw currentError;

      // 2. Fetch previous month for comparison
      const { data: previousTransactions, error: previousError } = await supabase
        .from("transactions")
        .select("amount_cents, type")
        .is("transfer_group_id", null)
        .gte("date", format(previousMonthStart, "yyyy-MM-dd"))
        .lte("date", format(previousMonthEnd, "yyyy-MM-dd"));

      if (previousError) throw previousError;

      // 3. Fetch last 6 months for trend
      const sixMonthsAgo = subMonths(monthStart, 5);
      const { data: trendTransactions, error: trendError } = await supabase
        .from("transactions")
        .select("date, amount_cents, type")
        .is("transfer_group_id", null)
        .gte("date", format(sixMonthsAgo, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (trendError) throw trendError;

      // 4. Fetch categories for breakdown
      const { data: categories, error: categoriesError } = await supabase
        .from("categories")
        .select("id, name, color")
        .eq("is_active", true);

      if (categoriesError) throw categoriesError;

      // 5. Fetch accounts for count and total balance
      const { data: accounts, error: accountsError } = await supabase
        .from("accounts")
        .select("id, initial_balance_cents")
        .eq("is_active", true);

      if (accountsError) throw accountsError;

      // 6. Fetch all transactions for account balances (INCLUDE transfers)
      const { data: allTransactions, error: allTransactionsError } = await supabase
        .from("transactions")
        .select("account_id, amount_cents, type");

      if (allTransactionsError) throw allTransactionsError;

      // 7. Fetch recent transactions (last 10)
      const { data: recentTransactions, error: recentError } = await supabase
        .from("transactions")
        .select(
          `
          *,
          account:accounts(id, name),
          category:categories(id, name, color)
        `
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);

      if (recentError) throw recentError;

      // Calculate summary
      const totalIncome = (currentTransactions || [])
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      const totalExpense = (currentTransactions || [])
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      const previousIncome = (previousTransactions || [])
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      const previousExpense = (previousTransactions || [])
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      // Enhanced metrics per DATABASE.md Monthly Summary Query spec
      const uniqueDates = new Set((currentTransactions || []).map((t) => t.date));
      const uniqueCategoryIds = new Set(
        (currentTransactions || []).filter((t) => t.category_id).map((t) => t.category_id)
      );
      const clearedTransactions = (currentTransactions || []).filter((t) => t.status === "cleared");
      const pendingTransactions = (currentTransactions || []).filter((t) => t.status === "pending");

      // Calculate total balance across all accounts (INCLUDE transfers)
      const totalBalance = (accounts || []).reduce((sum, account) => {
        const accountTransactions = (allTransactions || []).filter(
          (t) => t.account_id === account.id
        );
        const balance = accountTransactions.reduce((bal, t) => {
          return bal + (t.type === "income" ? t.amount_cents : -t.amount_cents);
        }, account.initial_balance_cents || 0);
        return sum + balance;
      }, 0);

      // Calculate monthly trend
      const monthlyTrend: Array<{ month: string; incomeCents: number; expenseCents: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const month = subMonths(currentMonth, i);
        const monthKey = format(month, "yyyy-MM");
        const monthTransactions = (trendTransactions || []).filter(
          (t) => format(new Date(t.date), "yyyy-MM") === monthKey
        );

        const income = monthTransactions
          .filter((t) => t.type === "income")
          .reduce((sum, t) => sum + t.amount_cents, 0);

        const expense = monthTransactions
          .filter((t) => t.type === "expense")
          .reduce((sum, t) => sum + t.amount_cents, 0);

        monthlyTrend.push({
          month: format(month, "MMM"),
          incomeCents: income,
          expenseCents: expense,
        });
      }

      // Calculate category breakdown
      const categoryTotals = new Map<string, number>();
      (currentTransactions || [])
        .filter((t) => t.type === "expense" && t.category_id)
        .forEach((t) => {
          const existing = categoryTotals.get(t.category_id!) || 0;
          categoryTotals.set(t.category_id!, existing + t.amount_cents);
        });

      const categoryBreakdown = Array.from(categoryTotals.entries())
        .map(([categoryId, amount]) => {
          const category = (categories || []).find((c) => c.id === categoryId);
          return {
            categoryId, // Include for click navigation
            categoryName: category?.name || "Unknown",
            color: category?.color || "#6B7280",
            amountCents: amount,
            percentOfTotal: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
          };
        })
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 10); // Top 10 categories

      return {
        summary: {
          totalIncomeCents: totalIncome,
          totalExpenseCents: totalExpense,
          netAmountCents: totalIncome - totalExpense,
          transactionCount: (currentTransactions || []).length,
          accountCount: (accounts || []).length,
          totalBalanceCents: totalBalance,
          previousMonthIncomeCents: previousIncome,
          previousMonthExpenseCents: previousExpense,
          // Enhanced metrics
          activeDays: uniqueDates.size,
          uniqueCategories: uniqueCategoryIds.size,
          clearedCount: clearedTransactions.length,
          pendingCount: pendingTransactions.length,
        },
        monthlyTrend,
        categoryBreakdown,
        recentTransactions: recentTransactions || [],
      };
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * TanStack Query hooks for budgets CRUD operations
 * CRITICAL: Budget vs actual calculations MUST exclude transfers
 */

/**
 * Individual budget with actual spending calculated
 */
export interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  parentCategoryName: string;
  budgetAmountCents: number;
  actualSpentCents: number;
  remainingCents: number;
  percentUsed: number;
  isOverBudget: boolean;
}

/**
 * Budget group by parent category
 */
export interface BudgetGroup {
  parentName: string;
  parentColor: string;
  totalBudgetCents: number;
  totalSpentCents: number;
  budgets: Budget[];
}

/**
 * Fetches budgets for a specific month with actual spending calculated.
 *
 * CRITICAL: Actual spending MUST exclude transfers using `.is("transfer_group_id", null)`.
 * Transfers are movements between accounts, not actual expenses, and would cause
 * incorrect budget calculations if included.
 *
 * Returns budgets grouped by parent category with rollup totals.
 *
 * @param month - The month to fetch budgets for
 * @returns Query result with BudgetGroup[] array
 *
 * @example
 * const { data: budgetGroups, isLoading } = useBudgets(new Date(2024, 0, 1));
 * // Returns budgets grouped by parent category with actual spending
 */
export function useBudgets(month: Date) {
  return useQuery({
    queryKey: ["budgets", format(month, "yyyy-MM")],
    queryFn: async (): Promise<BudgetGroup[]> => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const monthKey = format(monthStart, "yyyy-MM-dd");

      // 1. Fetch budgets for this month
      const { data: budgets, error: budgetsError } = await supabase
        .from("budgets")
        .select(
          `
          id,
          category_id,
          amount_cents,
          categories(id, name, color, parent_id)
        `
        )
        .eq("month", monthKey);

      if (budgetsError) throw budgetsError;

      // 2. Fetch parent categories
      const { data: parents, error: parentsError } = await supabase
        .from("categories")
        .select("id, name, color")
        .is("parent_id", null);

      if (parentsError) throw parentsError;

      // 3. Fetch actual spending for these categories
      // CRITICAL: Exclude transfers from spending calculation
      const categoryIds = budgets.map((b: { categories: { id: string }[] | { id: string } }) => {
        const cat = Array.isArray(b.categories) ? b.categories[0] : b.categories;
        return cat.id;
      });

      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("category_id, amount_cents, type")
        .in("category_id", categoryIds)
        .is("transfer_group_id", null) // ← Exclude transfers
        .eq("type", "expense")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (transactionsError) throw transactionsError;

      // Calculate spending per category
      const spendingMap = new Map<string, number>();
      transactions?.forEach((t) => {
        const existing = spendingMap.get(t.category_id) || 0;
        spendingMap.set(t.category_id, existing + t.amount_cents);
      });

      // Build budget objects
      const budgetObjects: Budget[] = budgets.map(
        (b: {
          id: string;
          amount_cents: number;
          categories:
            | { id: string; name: string; color: string; parent_id: string | null }[]
            | { id: string; name: string; color: string; parent_id: string | null };
        }) => {
          const category = Array.isArray(b.categories) ? b.categories[0] : b.categories;
          const parent = parents?.find((p) => p.id === category.parent_id);
          const actualSpent = spendingMap.get(category.id) || 0;
          const remaining = b.amount_cents - actualSpent;
          const percentUsed = b.amount_cents > 0 ? (actualSpent / b.amount_cents) * 100 : 0;

          return {
            id: b.id,
            categoryId: category.id,
            categoryName: category.name,
            categoryColor: category.color,
            parentCategoryName: parent?.name || "Uncategorized",
            budgetAmountCents: b.amount_cents,
            actualSpentCents: actualSpent,
            remainingCents: remaining,
            percentUsed,
            isOverBudget: actualSpent > b.amount_cents,
          };
        }
      );

      // Group by parent category
      const groupMap = new Map<string, BudgetGroup>();

      budgetObjects.forEach((budget) => {
        const parentName = budget.parentCategoryName;

        if (!groupMap.has(parentName)) {
          const parent = parents.find((p) => p.name === parentName);
          groupMap.set(parentName, {
            parentName,
            parentColor: parent?.color || "#6B7280",
            totalBudgetCents: 0,
            totalSpentCents: 0,
            budgets: [],
          });
        }

        const group = groupMap.get(parentName)!;
        group.totalBudgetCents += budget.budgetAmountCents;
        group.totalSpentCents += budget.actualSpentCents;
        group.budgets.push(budget);
      });

      return Array.from(groupMap.values());
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Creates a new budget for a category and month.
 *
 * Note: Database enforces unique constraint on (household_id, category_id, month).
 * Attempting to create duplicate budgets will fail.
 *
 * @returns Mutation hook for creating budgets
 */
export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { categoryId: string; month: Date; amountCents: number }) => {
      const monthKey = format(startOfMonth(data.month), "yyyy-MM-dd");

      const { data: budget, error } = await supabase
        .from("budgets")
        .insert({
          category_id: data.categoryId,
          month: monthKey,
          amount_cents: data.amountCents,
        })
        .select()
        .single();

      if (error) throw error;
      return budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

/**
 * Updates an existing budget's amount.
 *
 * Note: Category cannot be changed when editing - only the amount can be updated.
 * To change category, delete and create new budget.
 *
 * @returns Mutation hook for updating budgets
 */
export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; amountCents: number }) => {
      const { data: budget, error } = await supabase
        .from("budgets")
        .update({ amount_cents: data.amountCents })
        .eq("id", data.id)
        .select()
        .single();

      if (error) throw error;
      return budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

/**
 * Deletes a budget.
 *
 * Note: Deleting a budget does not affect transactions or actual spending data.
 *
 * @returns Mutation hook for deleting budgets
 */
export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", budgetId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

/**
 * Copies budgets from one month to another.
 *
 * Useful for replicating previous month's budget targets without manual re-entry.
 * Note: This is a convenience feature - budgets are independent per month (no rollover).
 *
 * @returns Mutation hook for copying budgets
 */
export function useCopyBudgets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { fromMonth: Date; toMonth: Date }) => {
      const fromKey = format(startOfMonth(data.fromMonth), "yyyy-MM-dd");
      const toKey = format(startOfMonth(data.toMonth), "yyyy-MM-dd");

      // Fetch budgets from previous month
      const { data: existingBudgets, error: fetchError } = await supabase
        .from("budgets")
        .select("category_id, amount_cents")
        .eq("month", fromKey);

      if (fetchError) throw fetchError;

      if (!existingBudgets || existingBudgets.length === 0) {
        throw new Error("No budgets found for previous month");
      }

      // Insert budgets for new month using upsert to handle partial copies
      const newBudgets = existingBudgets.map((b) => ({
        category_id: b.category_id,
        month: toKey,
        amount_cents: b.amount_cents,
      }));

      const { error: insertError } = await supabase
        .from("budgets")
        .upsert(newBudgets, { onConflict: "household_id,category_id,month" });

      if (insertError) throw insertError;

      return newBudgets.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}
