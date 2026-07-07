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
 * ordering (date desc, created_at desc), same 100-row cap, same joined
 * account/category shape.
 */
export async function getLocalTransactionsWithRelations(filters?: TransactionFilters) {
  const all = await db.transactions.toArray();
  const rows = applyTransactionFilters(all, filters);

  rows.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  return withLocalRelations(rows.slice(0, 100));
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
 * - Preserves the server query's ordering (date desc, created_at desc) and
 *   its row cap (pagination is a later phase).
 *
 * Pure function - exported for unit tests.
 */
export function overlayLocalTransactions<T extends MergeableTransactionRow>(
  serverRows: T[],
  localRows: T[],
  limit = 100
): T[] {
  if (localRows.length === 0) {
    return serverRows;
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

  return merged.slice(0, limit);
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
