/**
 * Local Dexie read fallbacks
 *
 * Used by the TanStack Query hooks in supabaseQueries.ts when Supabase is
 * unreachable: the queryFn tries the network first and falls back to these
 * IndexedDB reads, so lists keep rendering offline from the locally synced
 * data (mutations write here, realtime/catch-up mirrors remote changes here).
 *
 * The result shapes mirror the corresponding Supabase queries (including the
 * lightweight account/category joins) so consumers cannot tell the source
 * apart.
 *
 * @module offline/reads
 */

import { db, type LocalTransaction } from "@/lib/dexie/db";
import type { TransactionFilters } from "@/types/transactions";

/**
 * True when an error should trigger the local fallback: the browser knows
 * it is offline, or the failure smells like a transport problem rather than
 * a server-side rejection (which should surface to the user).
 */
export function isLikelyNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /fetch|network|timeout|connection/i.test(message);
}

/**
 * Mirrors the useTransactions Supabase filter clauses over in-memory rows.
 * Shared by the full offline fallback and the unsynced-row overlay so both
 * apply EXACTLY the same filter semantics as the server query.
 */
export function applyTransactionFilters(
  rows: LocalTransaction[],
  filters?: TransactionFilters
): LocalTransaction[] {
  if (filters?.dateFrom) {
    rows = rows.filter((t) => t.date >= filters.dateFrom!);
  }
  if (filters?.dateTo) {
    rows = rows.filter((t) => t.date <= filters.dateTo!);
  }
  if (filters?.accountId) {
    rows = rows.filter((t) => t.account_id === filters.accountId);
  }
  if (filters?.categoryId) {
    rows = rows.filter((t) => t.category_id === filters.categoryId);
  }
  if (filters?.status) {
    rows = rows.filter((t) => t.status === filters.status);
  }
  if (filters?.type) {
    rows = rows.filter((t) => t.type === filters.type);
  }
  if (filters?.amountMin !== undefined) {
    rows = rows.filter((t) => t.amount_cents >= filters.amountMin!);
  }
  if (filters?.amountMax !== undefined) {
    rows = rows.filter((t) => t.amount_cents <= filters.amountMax!);
  }
  if (filters?.search) {
    const needle = filters.search.toLowerCase();
    rows = rows.filter(
      (t) =>
        t.description.toLowerCase().includes(needle) ||
        (t.notes ?? "").toLowerCase().includes(needle)
    );
  }
  // CRITICAL: Exclude transfers by default (unless explicitly set to false)
  if (filters?.excludeTransfers !== false) {
    rows = rows.filter((t) => !t.transfer_group_id);
  }

  return rows;
}

/**
 * Attaches the lightweight account/category join shape the Supabase query
 * selects, sourced from the local Dexie mirrors.
 */
async function withLocalRelations(rows: LocalTransaction[]) {
  const [accounts, categories] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, { id: a.id, name: a.name }]));
  const categoryById = new Map(
    categories.map((c) => [c.id, { id: c.id, name: c.name, color: c.color }])
  );

  return rows.map((t) => ({
    ...t,
    account: t.account_id ? (accountById.get(t.account_id) ?? null) : null,
    category: t.category_id ? (categoryById.get(t.category_id) ?? null) : null,
  }));
}

/**
 * Local mirror of the useTransactions Supabase query: same filters, same
 * ordering (date desc, created_at desc), same joined account/category shape,
 * and the same `.range()` paging window (offset/limit) so the offline
 * fallback pages exactly like the server query (review R10).
 */
export async function getLocalTransactionsWithRelations(
  filters?: TransactionFilters,
  page: { offset?: number; limit?: number } = {}
) {
  const { offset = 0, limit = 100 } = page;
  const all = await db.transactions.toArray();
  const rows = applyTransactionFilters(all, filters);

  rows.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  return withLocalRelations(rows.slice(offset, offset + limit));
}

/**
 * Local transactions whose create/update has NOT reached the server yet
 * (outstanding queued/syncing/failed outbox items), filtered with the same
 * semantics as the server query and joined like it.
 *
 * Used by useTransactions to overlay just-written rows onto the Supabase
 * result, so a transaction created moments ago appears in the list before
 * the outbox drains (review R9).
 *
 * Scoped to `userId` like every other queue consumer (useSyncStatus,
 * getPendingQueueItems, getOutstandingQueueItems): the local DB is
 * per-device, but on a shared device another account's queued items must
 * not overlay stale rows into the current user's list.
 */
export async function getUnsyncedLocalTransactionsWithRelations(
  userId: string,
  filters?: TransactionFilters
) {
  const outstanding = await db.syncQueue
    .where("status")
    .anyOf("queued", "syncing", "failed")
    .filter(
      (item) =>
        item.user_id === userId &&
        item.entity_type === "transaction" &&
        item.operation.op !== "delete"
    )
    .toArray();

  if (outstanding.length === 0) {
    return [];
  }

  const unsyncedIds = [...new Set(outstanding.map((item) => item.entity_id))];
  const localRows = (await db.transactions.bulkGet(unsyncedIds)).filter(
    (t): t is LocalTransaction => t !== undefined
  );

  return withLocalRelations(applyTransactionFilters(localRows, filters));
}

/** Minimal row shape needed to merge and re-sort transaction lists. */
interface MergeableTransactionRow {
  id: string;
  date: string;
  created_at: string;
}

/**
 * Merges locally unsynced rows over a server result set.
 *
 * - Merge is by id; the LOCAL row wins (an unsynced local edit is newer
 *   than the server echo it overlays).
 * - Preserves the server query's ordering (date desc, created_at desc).
 * - `limit` optionally caps the merged list; omitted = no cap (the paged
 *   list has no fixed cap anymore, review R10).
 *
 * Pure function - exported for unit tests.
 */
export function overlayLocalTransactions<T extends MergeableTransactionRow>(
  serverRows: T[],
  localRows: T[],
  limit?: number
): T[] {
  if (localRows.length === 0) {
    return limit !== undefined ? serverRows.slice(0, limit) : serverRows;
  }

  const byId = new Map<string, T>();
  for (const row of serverRows) {
    byId.set(row.id, row);
  }
  for (const row of localRows) {
    byId.set(row.id, row); // local wins for unsynced edits
  }

  const merged = [...byId.values()];
  merged.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  return limit !== undefined ? merged.slice(0, limit) : merged;
}

/**
 * One fetched page of the transactions list plus the unsynced-row overlay
 * snapshot taken alongside that page fetch.
 *
 * The overlay is stored PER PAGE but deliberately NOT merged per page:
 * merging into each page independently would duplicate a local row whose
 * server echo arrives in a later page (page 1 shows the overlay copy, page 3
 * fetches the server copy → two rows with the same id). Instead the merge
 * happens once over the FLATTENED list in mergeTransactionPages, where a
 * single by-id map makes cross-page duplication impossible (review R10 + R9).
 */
export interface TransactionsListPage<T> {
  rows: T[];
  localOverlay: T[];
}

/**
 * Flattens useInfiniteQuery pages into the final list the UI renders.
 *
 * - Server rows are deduped by id across pages (a row can appear on two
 *   pages when inserts/deletes shift page boundaries between fetches);
 *   first occurrence wins, preserving the earlier page's position snapshot.
 * - Overlay snapshots are applied in page order, so the most recently
 *   fetched (freshest) snapshot of an unsynced row wins, and every overlay
 *   row overrides its server echo by id (an unsynced local edit is newer
 *   than the server copy) — a local row can never coexist with a duplicate
 *   server row from a later page.
 * - Overlay rows without a loaded server echo are inserted in sort position;
 *   the just-created-transaction case (review R9) lands at the top. A
 *   backdated unsynced row beyond the loaded window sorts to the end of the
 *   loaded list and settles into place as more pages load — hiding it would
 *   look like data loss.
 * - Re-sorted by the server ordering (date desc, created_at desc); no cap.
 *
 * OVERLAY × WINDOWING (maxPages): the infinite query caps its in-memory
 * window to a few pages so invalidation refetches cheaply, so `pageParams`
 * may no longer start at 0 once the user has scrolled deep (page 0 evicted).
 * The unsynced overlay only makes sense at the TOP of the list: a just-created
 * or freshly-edited local row sorts to the newest position (page 0). Injecting
 * it into a deep window (page 0 gone) would wrongly park a top-of-list row at
 * the end of, say, page 12 — visible at the wrong position. So the overlay is
 * applied ONLY when page 0 is present in the window (`pageParams` includes 0);
 * when page 0 has been evicted the overlay is skipped for that window, and the
 * row reappears in place the moment the user scrolls back to the top and page 0
 * is re-fetched. Dedup against a server echo is unaffected (still by id).
 *
 * Pure function - exported for unit tests.
 *
 * @param pages       the (possibly windowed) fetched pages, in window order
 * @param pageParams  the ABSOLUTE page index of each page (parallel to
 *                     `pages`); the overlay is applied only if 0 is present.
 *                     Omitted → treated as page 0 present (back-compat).
 */
export function mergeTransactionPages<T extends MergeableTransactionRow>(
  pages: Array<TransactionsListPage<T>>,
  pageParams?: readonly number[]
): T[] {
  const byId = new Map<string, T>();
  for (const page of pages) {
    for (const row of page.rows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, row); // first occurrence wins across boundary shifts
      }
    }
  }

  // Apply the unsynced overlay only when the top page (index 0) is in the
  // window — that is where a new/edited local row belongs. See doc block.
  const hasPageZero = pageParams === undefined || pageParams.includes(0);
  if (hasPageZero) {
    for (const page of pages) {
      for (const row of page.localOverlay) {
        byId.set(row.id, row); // local wins; later (fresher) snapshots override
      }
    }
  }

  const merged = [...byId.values()];
  merged.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  return merged;
}

/**
 * Aggregate answer for the transactions filter header: how many rows match
 * the filters, and the income/expense totals in cents.
 */
export interface TransactionsFilterSummary {
  count: number;
  totalInCents: number;
  totalOutCents: number;
}

/**
 * Local mirror of the transactions_filter_summary RPC: count + In/Out totals
 * computed over the FULL local dataset (not just loaded pages) with exactly
 * the same filter semantics as the server function, including the
 * exclude-transfers default (review R10).
 *
 * Used when the RPC is unreachable (offline) or fails, so the three numbers
 * always come from a single source instead of mixing a server count with
 * client-computed totals.
 */
export async function getLocalTransactionsFilterSummary(
  filters?: TransactionFilters
): Promise<TransactionsFilterSummary> {
  const all = await db.transactions.toArray();
  const rows = applyTransactionFilters(all, filters);

  let totalInCents = 0;
  let totalOutCents = 0;
  for (const t of rows) {
    if (t.type === "income") {
      totalInCents += t.amount_cents;
    } else if (t.type === "expense") {
      totalOutCents += t.amount_cents;
    }
  }

  return { count: rows.length, totalInCents, totalOutCents };
}

/**
 * Local mirror of useAccounts: active accounts ordered by sort_order.
 */
export async function getLocalActiveAccounts() {
  const accounts = await db.accounts.filter((a) => a.is_active).toArray();
  accounts.sort((a, b) => a.sort_order - b.sort_order);
  return accounts;
}

/**
 * Local mirror of useCategories: active categories ordered by sort_order,
 * then name. parent_id is normalized to null (Dexie stores it as undefined,
 * but consumers group with `parent_id === null` like the Supabase rows).
 */
export async function getLocalActiveCategories() {
  const categories = await db.categories.filter((c) => c.is_active).toArray();
  categories.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return categories.map((c) => ({ ...c, parent_id: c.parent_id ?? null }));
}
