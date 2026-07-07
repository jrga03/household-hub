/**
 * Tests for the local Dexie read fallbacks and the unsynced-row overlay
 * used by useTransactions (review R9): a transaction created moments ago
 * must appear in the list even before the outbox drains to Supabase.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import {
  applyTransactionFilters,
  getUnsyncedLocalTransactionsWithRelations,
  overlayLocalTransactions,
} from "./reads";
import type { SyncQueueItem, SyncQueueStatus, OperationType } from "@/types/sync";

// ─── Helpers ─────────────────────────────────────

function makeTransaction(overrides: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    date: "2026-07-01",
    description: "Test transaction",
    amount_cents: 10000,
    type: "expense",
    currency_code: "PHP",
    status: "pending",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    device_id: "dev-1",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeQueueItem(
  entityId: string,
  status: SyncQueueStatus = "queued",
  op: OperationType = "create",
  userId = "user-1"
): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    entity_type: "transaction",
    entity_id: entityId,
    operation: { op, payload: {}, idempotencyKey: `key-${entityId}-${op}`, lamportClock: 1 },
    device_id: "dev-1",
    user_id: userId,
    status,
    retry_count: 0,
    max_retries: 3,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced_at: null,
    next_retry_at: null,
  };
}

// ─── overlayLocalTransactions (pure) ─────────────

describe("overlayLocalTransactions", () => {
  const server = [
    { id: "s1", date: "2026-07-03", created_at: "2026-07-03T08:00:00Z" },
    { id: "s2", date: "2026-07-01", created_at: "2026-07-01T08:00:00Z" },
  ];

  it("returns server rows untouched when there are no local rows", () => {
    expect(overlayLocalTransactions(server, [])).toBe(server);
  });

  it("inserts local-only rows in sort position (date desc, created_at desc)", () => {
    const local = [{ id: "l1", date: "2026-07-02", created_at: "2026-07-02T08:00:00Z" }];

    const merged = overlayLocalTransactions(server, local);

    expect(merged.map((r) => r.id)).toEqual(["s1", "l1", "s2"]);
  });

  it("local row wins over the server row with the same id (unsynced edit)", () => {
    const local = [
      { id: "s2", date: "2026-07-01", created_at: "2026-07-01T08:00:00Z", edited: true },
    ];

    const merged = overlayLocalTransactions<(typeof local)[number]>(
      server as (typeof local)[number][],
      local
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === "s2")?.edited).toBe(true);
  });

  it("sorts same-date rows by created_at desc", () => {
    const local = [{ id: "l1", date: "2026-07-03", created_at: "2026-07-03T09:00:00Z" }];

    const merged = overlayLocalTransactions(server, local);

    expect(merged.map((r) => r.id)).toEqual(["l1", "s1", "s2"]);
  });

  it("keeps the row cap after merging", () => {
    const manyServer = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      date: "2026-06-30",
      created_at: `2026-06-30T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const local = [{ id: "l1", date: "2026-07-04", created_at: "2026-07-04T08:00:00Z" }];

    const merged = overlayLocalTransactions(manyServer, local);

    expect(merged).toHaveLength(100);
    expect(merged[0].id).toBe("l1"); // newest local row displaces the oldest server row
  });
});

// ─── applyTransactionFilters (pure) ──────────────

describe("applyTransactionFilters", () => {
  it("excludes transfers by default", () => {
    const rows = [
      makeTransaction({ id: "t1" }),
      makeTransaction({ id: "t2", transfer_group_id: "tg-1" }),
    ];

    expect(applyTransactionFilters(rows).map((t) => t.id)).toEqual(["t1"]);
    expect(applyTransactionFilters(rows, { excludeTransfers: false })).toHaveLength(2);
  });

  it("mirrors the server filter clauses", () => {
    const rows = [
      makeTransaction({ id: "t1", date: "2026-07-01", type: "expense", amount_cents: 5000 }),
      makeTransaction({ id: "t2", date: "2026-07-02", type: "income", amount_cents: 20000 }),
      makeTransaction({ id: "t3", date: "2026-06-01", type: "expense", amount_cents: 9000 }),
    ];

    expect(
      applyTransactionFilters(rows, { dateFrom: "2026-07-01", type: "expense" }).map((t) => t.id)
    ).toEqual(["t1"]);
    expect(applyTransactionFilters(rows, { amountMin: 9000 }).map((t) => t.id)).toEqual([
      "t2",
      "t3",
    ]);
  });
});

// ─── getUnsyncedLocalTransactionsWithRelations ───

describe("getUnsyncedLocalTransactionsWithRelations", () => {
  beforeEach(async () => {
    await db.transactions.clear();
    await db.syncQueue.clear();
    await db.accounts.clear();
    await db.categories.clear();
  });

  it("returns [] when the outbox has no outstanding transaction items", async () => {
    await db.transactions.add(makeTransaction());

    expect(await getUnsyncedLocalTransactionsWithRelations("user-1")).toEqual([]);
  });

  it("returns only rows with queued/syncing/failed create/update items", async () => {
    const queued = makeTransaction({ id: "tx-queued" });
    const failed = makeTransaction({ id: "tx-failed" });
    const completed = makeTransaction({ id: "tx-completed" });
    await db.transactions.bulkAdd([queued, failed, completed]);
    await db.syncQueue.bulkAdd([
      makeQueueItem("tx-queued", "queued"),
      makeQueueItem("tx-failed", "failed"),
      makeQueueItem("tx-completed", "completed"),
      makeQueueItem("tx-deleted", "queued", "delete"), // delete ops never overlay
    ]);

    const rows = await getUnsyncedLocalTransactionsWithRelations("user-1");

    expect(rows.map((t) => t.id).sort()).toEqual(["tx-failed", "tx-queued"]);
  });

  it("excludes another user's queue items (shared device)", async () => {
    const mine = makeTransaction({ id: "tx-mine" });
    const theirs = makeTransaction({ id: "tx-theirs" });
    await db.transactions.bulkAdd([mine, theirs]);
    await db.syncQueue.bulkAdd([
      makeQueueItem("tx-mine", "queued"),
      makeQueueItem("tx-theirs", "queued", "create", "user-2"),
    ]);

    const rows = await getUnsyncedLocalTransactionsWithRelations("user-1");

    expect(rows.map((t) => t.id)).toEqual(["tx-mine"]);
  });

  it("applies the same filters as the server query", async () => {
    const match = makeTransaction({ id: "tx-match", type: "expense" });
    const noMatch = makeTransaction({ id: "tx-nomatch", type: "income" });
    await db.transactions.bulkAdd([match, noMatch]);
    await db.syncQueue.bulkAdd([makeQueueItem("tx-match"), makeQueueItem("tx-nomatch")]);

    const rows = await getUnsyncedLocalTransactionsWithRelations("user-1", { type: "expense" });

    expect(rows.map((t) => t.id)).toEqual(["tx-match"]);
  });

  it("joins the account/category shape from the local mirrors", async () => {
    await db.accounts.add({
      id: "acc-1",
      household_id: "hh-1",
      name: "BPI Checking",
      type: "bank",
      color: "#0000ff",
      icon: "bank",
      currency_code: "PHP",
      initial_balance_cents: 0,
      is_active: true,
      sort_order: 0,
      visibility: "household",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await db.transactions.add(makeTransaction({ id: "tx-1", account_id: "acc-1" }));
    await db.syncQueue.add(makeQueueItem("tx-1"));

    const rows = await getUnsyncedLocalTransactionsWithRelations("user-1");

    expect(rows).toHaveLength(1);
    expect(rows[0].account).toEqual({ id: "acc-1", name: "BPI Checking" });
    expect(rows[0].category).toBeNull();
  });
});
