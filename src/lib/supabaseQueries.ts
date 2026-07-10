import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuthStore } from "@/stores/authStore";
import {
  isLikelyNetworkError,
  getLocalTransactionsWithRelations,
  getLocalTransactionsFilterSummary,
  getUnsyncedLocalTransactionsWithRelations,
  mergeTransactionPages,
  getLocalActiveAccounts,
  getLocalActiveCategories,
  type TransactionsListPage,
  type TransactionsFilterSummary,
} from "./offline/reads";
import { getLocalDashboardData, hasLocalFinancialData } from "./offline/aggregates";
import { getLocalBudgetGroups, mirrorBudgetsForMonth } from "./offline/budgets";
import { OfflineError } from "./offline/errors";
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

/**
 * Shared query definition for the active-accounts list.
 *
 * Exported so useAccounts AND usePrefetchTransactionData use the SAME
 * queryKey + queryFn. Previously the prefetch fetched `select("*").order
 * ("name")` (no is_active filter) into key ["accounts"], poisoning the cache
 * so archived accounts appeared in every dropdown for 10 minutes (DATA-06).
 */
export function accountsQueryOptions() {
  return {
    queryKey: ["accounts"] as const,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("accounts")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (error) throw error;
        return data as Account[];
      } catch (error) {
        // Offline fallback: serve the locally synced copy from Dexie
        if (isLikelyNetworkError(error)) {
          console.warn("[useAccounts] Network unavailable - reading from Dexie");
          return (await getLocalActiveAccounts()) as Account[];
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    networkMode: "always" as const, // run the queryFn offline so the Dexie fallback can serve
  };
}

// Fetch all active accounts
export function useAccounts() {
  return useQuery(accountsQueryOptions());
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
/**
 * Row shape returned by the get_account_balances Postgres function.
 * Aggregation happens server-side because fetching raw transaction rows is
 * silently capped at PostgREST's max-rows (1,000 by default), which made
 * client-computed balances wrong past 1,000 transactions (review DATA-02).
 * Transfers are intentionally INCLUDED - they move money between accounts.
 */
interface AccountBalanceDeltaRow {
  account_id: string;
  cleared_delta_cents: number;
  pending_delta_cents: number;
  cleared_count: number;
  pending_count: number;
}

const EMPTY_BALANCE_DELTA: Omit<AccountBalanceDeltaRow, "account_id"> = {
  cleared_delta_cents: 0,
  pending_delta_cents: 0,
  cleared_count: 0,
  pending_count: 0,
};

export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ["account-balance", accountId],
    queryFn: async (): Promise<AccountBalance> => {
      // Account details and server-side balance deltas, in parallel
      const [accountResult, deltasResult] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, initial_balance_cents")
          .eq("id", accountId)
          .single(),
        supabase.rpc("get_account_balances", { p_account_ids: [accountId] }),
      ]);

      if (accountResult.error) throw accountResult.error;
      const account = accountResult.data;
      if (!account) throw new Error("Account not found");

      if (deltasResult.error) throw deltasResult.error;
      const deltas = (deltasResult.data ?? []) as AccountBalanceDeltaRow[];
      const d = deltas[0] ?? { account_id: accountId, ...EMPTY_BALANCE_DELTA };

      const initialBalance = account.initial_balance_cents || 0;

      return {
        accountId: account.id,
        accountName: account.name,
        initialBalance,
        currentBalance: initialBalance + d.cleared_delta_cents + d.pending_delta_cents,
        clearedBalance: initialBalance + d.cleared_delta_cents,
        pendingBalance: d.pending_delta_cents, // Can be positive or negative
        transactionCount: d.cleared_count + d.pending_count,
        clearedCount: d.cleared_count,
        pendingCount: d.pending_count,
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

      // Server-side aggregation for active accounts (see AccountBalanceDeltaRow)
      const { data: deltaRows, error: deltasError } = await supabase.rpc("get_account_balances", {
        p_account_ids: accounts.map((a) => a.id),
      });

      if (deltasError) throw deltasError;

      const deltaByAccount = new Map(
        ((deltaRows ?? []) as AccountBalanceDeltaRow[]).map((d) => [d.account_id, d])
      );

      // Build AccountBalance array (accounts with no transactions get zeros)
      return accounts.map((account) => {
        const d = deltaByAccount.get(account.id) ?? {
          account_id: account.id,
          ...EMPTY_BALANCE_DELTA,
        };
        const initialBalance = account.initial_balance_cents || 0;

        return {
          accountId: account.id,
          accountName: account.name,
          initialBalance,
          currentBalance: initialBalance + d.cleared_delta_cents + d.pending_delta_cents,
          clearedBalance: initialBalance + d.cleared_delta_cents,
          pendingBalance: d.pending_delta_cents,
          transactionCount: d.cleared_count + d.pending_count,
          clearedCount: d.cleared_count,
          pendingCount: d.pending_count,
        };
      });
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * TanStack Query hooks for categories CRUD operations
 */

/**
 * Shared query definition for the active-categories list (see
 * accountsQueryOptions for why: prefetch and hook must not diverge, DATA-06).
 */
export function categoriesQueryOptions() {
  return {
    queryKey: ["categories"] as const,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (error) throw error;
        return data as Category[];
      } catch (error) {
        // Offline fallback: serve the locally synced copy from Dexie
        if (isLikelyNetworkError(error)) {
          console.warn("[useCategories] Network unavailable - reading from Dexie");
          return (await getLocalActiveCategories()) as Category[];
        }
        throw error;
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (categories change rarely)
    networkMode: "always" as const, // run the queryFn offline so the Dexie fallback can serve
  };
}

// Fetch all categories
export function useCategories() {
  return useQuery(categoriesQueryOptions());
}

// Fetch categories grouped by parent
export function useCategoriesGrouped() {
  return useQuery({
    queryKey: ["categories", "grouped"],
    queryFn: async () => {
      let categories: Category[];
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (error) throw error;

        categories = data as Category[];
      } catch (error) {
        // Offline fallback: serve the locally synced copy from Dexie
        if (!isLikelyNetworkError(error)) throw error;
        console.warn("[useCategoriesGrouped] Network unavailable - reading from Dexie");
        categories = (await getLocalActiveCategories()) as Category[];
      }

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
    networkMode: "always", // run the queryFn offline so the Dexie fallback can serve
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

/** Rows fetched per page of the transactions list (review R10). */
export const TRANSACTIONS_PAGE_SIZE = 50;

/**
 * Builds the filtered transactions list query (shared filter mapping for
 * every page fetch). Filters convert camelCase to snake_case for the DB.
 */
function buildTransactionsListQuery(filters?: TransactionFilters) {
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

  return query;
}

/**
 * Fetch transactions with filters, paged via useInfiniteQuery (review R10:
 * the old query hard-capped the list at 100 rows with no next page).
 *
 * - Each page is a `.range()` window of TRANSACTIONS_PAGE_SIZE rows; a full
 *   page means there may be more (getNextPageParam), a short page ends it.
 * - `data` is the FLATTENED list (select → mergeTransactionPages), so
 *   consumers keep receiving TransactionWithRelations[].
 * - Unsynced-row overlay (review R9): each page fetch also snapshots the
 *   locally unsynced rows, but the overlay is merged once over the
 *   flattened list — never per page — so a local row cannot duplicate its
 *   server echo arriving in a later page (see TransactionsListPage docs).
 * - Offline fallback mirrors the same paging window from Dexie. Those pages
 *   need no overlay: db.transactions already holds the unsynced rows.
 */
export function useTransactions(filters?: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<TransactionsListPage<TransactionWithRelations>> => {
      const from = pageParam * TRANSACTIONS_PAGE_SIZE;
      const to = from + TRANSACTIONS_PAGE_SIZE - 1;

      try {
        const { data, error } = await buildTransactionsListQuery(filters).range(from, to);

        if (error) throw error;

        // Overlay snapshot: local rows whose outbox items haven't drained
        // yet (created seconds ago, or edited offline). Scoped to the
        // signed-in user so another account's queued items on a shared
        // device never overlay this user's list.
        const userId = useAuthStore.getState().user?.id;
        const localOverlay = userId
          ? ((await getUnsyncedLocalTransactionsWithRelations(
              userId,
              filters
            )) as unknown as TransactionWithRelations[])
          : [];
        return { rows: data as TransactionWithRelations[], localOverlay };
      } catch (error) {
        // Offline fallback: same filters, joins and paging served from Dexie
        if (isLikelyNetworkError(error)) {
          console.warn("[useTransactions] Network unavailable - reading from Dexie");
          const rows = (await getLocalTransactionsWithRelations(filters, {
            offset: from,
            limit: TRANSACTIONS_PAGE_SIZE,
          })) as unknown as TransactionWithRelations[];
          return { rows, localOverlay: [] };
        }
        throw error;
      }
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.rows.length === TRANSACTIONS_PAGE_SIZE ? allPages.length : undefined,
    // No maxPages cap: invalidation refetches every loaded page sequentially,
    // which is accepted cost for typical few-page sessions. A cap would evict
    // page 1 while the virtualizer still renders the full flattened list,
    // dropping the top rows mid-scroll — do not add maxPages without also
    // implementing bidirectional fetch (see plan doc Decisions & Deferrals).
    select: (data) => mergeTransactionPages(data.pages),
    staleTime: 2 * 60 * 1000, // 2 minutes
    networkMode: "always", // run the queryFn offline so the Dexie fallback can serve
  });
}

/**
 * Raw row shape returned by the transactions_filter_summary RPC (BIGINTs
 * arrive as JSON numbers; amounts are capped well below 2^53).
 */
interface TransactionsFilterSummaryRow {
  txn_count: number | string;
  total_in_cents: number | string;
  total_out_cents: number | string;
}

export type { TransactionsFilterSummary };

/**
 * Exact count + In/Out totals for the CURRENT filter set, computed
 * server-side over the whole filtered dataset (review R10: the old header
 * summed the loaded rows, silently wrong past the row cap).
 *
 * - RPC transactions_filter_summary runs SECURITY INVOKER, so RLS scopes the
 *   answer to exactly the rows the user could list.
 * - Fallback: when the RPC is unreachable or fails, the summary is computed
 *   from the FULL local Dexie dataset with the same filter semantics. All
 *   three numbers always come from one source — never a server count next
 *   to client totals.
 * - Keyed under the ["transactions"] prefix so every existing
 *   invalidateQueries({ queryKey: ["transactions"] }) call (mutations,
 *   post-sync drain) refreshes the summary alongside the list.
 */
export function useTransactionsFilterSummary(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", "filter-summary", filters],
    queryFn: async (): Promise<TransactionsFilterSummary> => {
      try {
        const { data, error } = await supabase.rpc("transactions_filter_summary", {
          p_date_from: filters?.dateFrom ?? null,
          p_date_to: filters?.dateTo ?? null,
          p_account_id: filters?.accountId ?? null,
          p_category_id: filters?.categoryId ?? null,
          p_status: filters?.status ?? null,
          p_type: filters?.type ?? null,
          p_amount_min: filters?.amountMin ?? null,
          p_amount_max: filters?.amountMax ?? null,
          p_search: filters?.search ?? null,
          // CRITICAL: transfers excluded unless explicitly included, matching
          // the list query and the analytics rule
          p_exclude_transfers: filters?.excludeTransfers !== false,
        });

        if (error) throw error;

        const rows = (data ?? []) as TransactionsFilterSummaryRow[];
        const row = Array.isArray(rows) ? rows[0] : (rows as TransactionsFilterSummaryRow);
        return {
          count: Number(row?.txn_count ?? 0),
          totalInCents: Number(row?.total_in_cents ?? 0),
          totalOutCents: Number(row?.total_out_cents ?? 0),
        };
      } catch (error) {
        if (isLikelyNetworkError(error)) {
          console.warn(
            "[useTransactionsFilterSummary] network unreachable - computing from Dexie",
            error
          );
          return getLocalTransactionsFilterSummary(filters);
        }
        // Non-network failures (RPC not deployed, RLS/permission errors) must
        // be loud, not silently served from the sparse local mirror next to a
        // server-fetched list: rethrow so the route derives the header numbers
        // from the loaded pages (one source) until the RPC is reachable.
        console.error("[useTransactionsFilterSummary] RPC failed", error);
        throw error;
      }
    },
    staleTime: 2 * 60 * 1000, // matches the list query so the numbers agree
    networkMode: "always", // run the queryFn offline so the Dexie fallback can serve
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
    enabled: !!id, // skip when there is no id (e.g. create mode)
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
/**
 * Sets an explicit status on a batch of transactions in a single UPDATE.
 *
 * Use this for bulk actions ("Mark Cleared" / "Mark Pending"). Unlike
 * useToggleTransactionStatus, mixed selections converge on the requested
 * status instead of flipping rows that were already correct.
 */
export function useSetTransactionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "pending" | "cleared" }) => {
      const { error } = await supabase.from("transactions").update({ status }).in("id", ids);

      if (error) throw error;

      return status;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      // Status moves amounts between the cleared/pending balance splits
      queryClient.invalidateQueries({ queryKey: ["account-balance"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    },
  });
}

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
async function fetchDashboardDataFromServer(currentMonth: Date): Promise<DashboardData> {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const previousMonthStart = startOfMonth(subMonths(currentMonth, 1));
  const previousMonthEnd = endOfMonth(subMonths(currentMonth, 1));

  const sixMonthsAgo = subMonths(monthStart, 5);

  // All seven data sources are independent; fetch them in parallel
  // instead of paying 7 sequential round trips per dashboard load.
  const [
    currentResult,
    previousResult,
    trendResult,
    categoriesResult,
    accountsResult,
    balanceDeltasResult,
    recentResult,
  ] = await Promise.all([
    // 1. Current month transactions (exclude transfers)
    supabase
      .from("transactions")
      .select("id, amount_cents, type, category_id, status, date")
      .is("transfer_group_id", null) // Exclude transfers
      .gte("date", format(monthStart, "yyyy-MM-dd"))
      .lte("date", format(monthEnd, "yyyy-MM-dd")),
    // 2. Previous month for comparison
    supabase
      .from("transactions")
      .select("amount_cents, type")
      .is("transfer_group_id", null)
      .gte("date", format(previousMonthStart, "yyyy-MM-dd"))
      .lte("date", format(previousMonthEnd, "yyyy-MM-dd")),
    // 3. Last 6 months for trend
    supabase
      .from("transactions")
      .select("date, amount_cents, type")
      .is("transfer_group_id", null)
      .gte("date", format(sixMonthsAgo, "yyyy-MM-dd"))
      .lte("date", format(monthEnd, "yyyy-MM-dd")),
    // 4. Categories for breakdown
    supabase.from("categories").select("id, name, color").eq("is_active", true),
    // 5. Accounts for count and total balance
    supabase.from("accounts").select("id, initial_balance_cents").eq("is_active", true),
    // 6. Per-account balance deltas, aggregated server-side (INCLUDE
    //    transfers). Replaces an unbounded fetch of every transaction row,
    //    which PostgREST silently capped at max-rows (review DATA-02).
    supabase.rpc("get_account_balances"),
    // 7. Recent transactions (last 10)
    supabase
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
      .limit(10),
  ]);

  if (currentResult.error) throw currentResult.error;
  if (previousResult.error) throw previousResult.error;
  if (trendResult.error) throw trendResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (accountsResult.error) throw accountsResult.error;
  if (balanceDeltasResult.error) throw balanceDeltasResult.error;
  if (recentResult.error) throw recentResult.error;

  const currentTransactions = currentResult.data;
  const previousTransactions = previousResult.data;
  const trendTransactions = trendResult.data;
  const categories = categoriesResult.data;
  const accounts = accountsResult.data;
  const balanceDeltas = (balanceDeltasResult.data ?? []) as AccountBalanceDeltaRow[];
  const recentTransactions = recentResult.data;

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

  // Calculate total balance across active accounts (INCLUDE transfers)
  const deltaByAccount = new Map(
    balanceDeltas.map((d) => [d.account_id, d.cleared_delta_cents + d.pending_delta_cents])
  );
  const totalBalance = (accounts || []).reduce(
    (sum, account) =>
      sum + (account.initial_balance_cents || 0) + (deltaByAccount.get(account.id) ?? 0),
    0
  );

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
}

export function useDashboardData(currentMonth: Date) {
  return useQuery({
    queryKey: ["dashboard", format(currentMonth, "yyyy-MM")],
    queryFn: async (): Promise<DashboardData> => {
      try {
        return await fetchDashboardDataFromServer(currentMonth);
      } catch (error) {
        // Offline fallback (review R11): recompute the same aggregates from
        // the local Dexie mirrors - identical month bounds, transfer
        // exclusion, and balance semantics (see offline/aggregates.ts).
        if (isLikelyNetworkError(error)) {
          console.warn("[useDashboardData] Network unavailable - computing from Dexie");
          if (!(await hasLocalFinancialData())) {
            // Fresh device that never synced: all-zero aggregates would be a
            // false dashboard, so surface a typed offline state instead
            throw new OfflineError("your dashboard");
          }
          return (await getLocalDashboardData(currentMonth)) as unknown as DashboardData;
        }
        throw error;
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    networkMode: "always", // run the queryFn offline so the Dexie fallback can serve
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
/**
 * Server budget row shape (the columns the Dexie mirror stores, matching the
 * budgets table minus the generated month_key). See offline/budgets.ts.
 */
interface ServerBudgetRow {
  id: string;
  household_id: string;
  category_id: string;
  month: string;
  amount_cents: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
}

async function fetchBudgetGroupsFromServer(month: Date): Promise<BudgetGroup[]> {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const monthKey = format(monthStart, "yyyy-MM-dd");

  // 1. Fetch budgets for this month (full row so the Dexie mirror keeps
  //    the server shape; month_key is generated server-side and skipped)
  const { data: budgets, error: budgetsError } = await supabase
    .from("budgets")
    .select(
      `
          id,
          household_id,
          category_id,
          month,
          amount_cents,
          currency_code,
          created_at,
          updated_at,
          categories(id, name, color, parent_id)
        `
    )
    .eq("month", monthKey);

  if (budgetsError) throw budgetsError;

  // Mirror this month's budget targets into Dexie so Budgets renders
  // offline (review R11). Budgets have no outbox/realtime path, so this
  // successful read IS the mirror. Reference targets only (Decision #80):
  // actual spending stays derived from transactions. Mirror failures must
  // never break the online read.
  try {
    await mirrorBudgetsForMonth(
      monthKey,
      ((budgets ?? []) as ServerBudgetRow[]).map((b) => ({
        id: b.id,
        household_id: b.household_id,
        category_id: b.category_id,
        month: b.month,
        amount_cents: b.amount_cents,
        currency_code: b.currency_code,
        created_at: b.created_at,
        updated_at: b.updated_at,
      }))
    );
  } catch (mirrorError) {
    console.warn("[useBudgets] Failed to mirror budgets into Dexie:", mirrorError);
  }

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
}

export function useBudgets(month: Date) {
  return useQuery({
    queryKey: ["budgets", format(month, "yyyy-MM")],
    queryFn: async (): Promise<BudgetGroup[]> => {
      try {
        return await fetchBudgetGroupsFromServer(month);
      } catch (error) {
        // Offline fallback (review R11): mirrored targets + actual spending
        // recomputed from local transactions (offline/budgets.ts). Throws a
        // typed OfflineError when this month was never mirrored here, so the
        // route can show an honest offline state instead of "no budgets".
        if (isLikelyNetworkError(error)) {
          console.warn("[useBudgets] Network unavailable - reading from Dexie");
          return getLocalBudgetGroups(month);
        }
        throw error;
      }
    },
    staleTime: 30 * 1000,
    networkMode: "always", // run the queryFn offline so the Dexie fallback can serve
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
