/**
 * Tests for the local Dexie read fallbacks and the unsynced-row overlay
 * used by useTransactions (review R9): a transaction created moments ago
 * must appear in the list even before the outbox drains to Supabase.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import {
  applyTransactionFilters,
  getLocalTransactionsFilterSummary,
  getLocalTransactionsWithRelations,
  getUnsyncedLocalTransactionsWithRelations,
  mergeTransactionPages,
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

  it("applies an explicit row cap after merging", () => {
    const manyServer = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      date: "2026-06-30",
      created_at: `2026-06-30T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const local = [{ id: "l1", date: "2026-07-04", created_at: "2026-07-04T08:00:00Z" }];

    const merged = overlayLocalTransactions(manyServer, local, 100);

    expect(merged).toHaveLength(100);
    expect(merged[0].id).toBe("l1"); // newest local row displaces the oldest server row
  });

  it("does not cap the merged list when no limit is given (paged list, R10)", () => {
    const manyServer = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      date: "2026-06-30",
      created_at: `2026-06-30T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const local = [{ id: "l1", date: "2026-07-04", created_at: "2026-07-04T08:00:00Z" }];

    expect(overlayLocalTransactions(manyServer, local)).toHaveLength(101);
  });
});

// ─── mergeTransactionPages (pure) ────────────────

describe("mergeTransactionPages", () => {
  const row = (id: string, date: string, createdAt = `${date}T08:00:00Z`) => ({
    id,
    date,
    created_at: createdAt,
  });

  it("flattens pages preserving the server sort (date desc, created_at desc)", () => {
    const merged = mergeTransactionPages([
      { rows: [row("a", "2026-07-05"), row("b", "2026-07-04")], localOverlay: [] },
      { rows: [row("c", "2026-07-03"), row("d", "2026-07-02")], localOverlay: [] },
    ]);

    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("dedupes a server row repeated across pages (boundary shift between fetches)", () => {
    // An insert between the two page fetches pushed row "b" from page 1's
    // window into page 2's window as well
    const merged = mergeTransactionPages([
      { rows: [row("a", "2026-07-05"), row("b", "2026-07-04")], localOverlay: [] },
      { rows: [row("b", "2026-07-04"), row("c", "2026-07-03")], localOverlay: [] },
    ]);

    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("overlay row does not duplicate its server echo arriving in a LATER page", () => {
    // Page 1 was fetched while "x" was still local-only (overlay snapshot
    // includes it); by page 2's fetch the outbox drained and the server
    // returns the echo. The local copy must win, exactly once.
    const localX = { ...row("x", "2026-07-03", "2026-07-03T09:00:00Z"), local: true };
    const serverX = { ...row("x", "2026-07-03", "2026-07-03T09:00:00Z"), local: false };

    const merged = mergeTransactionPages<typeof localX>([
      { rows: [row("a", "2026-07-05") as typeof localX], localOverlay: [localX] },
      { rows: [serverX, row("c", "2026-07-02") as typeof localX], localOverlay: [] },
    ]);

    expect(merged.filter((r) => r.id === "x")).toHaveLength(1);
    expect(merged.find((r) => r.id === "x")?.local).toBe(true);
    expect(merged.map((r) => r.id)).toEqual(["a", "x", "c"]);
  });

  it("a later page's fresher overlay snapshot wins over an earlier one", () => {
    const stale = { ...row("x", "2026-07-03"), amount: 1 };
    const fresh = { ...row("x", "2026-07-03"), amount: 2 };

    const merged = mergeTransactionPages<typeof stale>([
      { rows: [], localOverlay: [stale] },
      { rows: [], localOverlay: [fresh] },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(2);
  });

  it("inserts overlay-only rows in sort position without capping the list", () => {
    const merged = mergeTransactionPages([
      { rows: [row("a", "2026-07-05"), row("c", "2026-07-03")], localOverlay: [] },
      { rows: [row("d", "2026-07-02")], localOverlay: [row("b", "2026-07-04")] },
    ]);

    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  // ── Overlay × windowing (maxPages, bidirectional) ──────────────────────
  describe("overlay × windowing (maxPages)", () => {
    it("applies the overlay when page 0 is present in the window", () => {
      const localOnly = row("new", "2026-07-06", "2026-07-06T09:00:00Z"); // newest → top
      const merged = mergeTransactionPages(
        [
          { rows: [row("a", "2026-07-05"), row("b", "2026-07-04")], localOverlay: [localOnly] },
          { rows: [row("c", "2026-07-03")], localOverlay: [] },
        ],
        [0, 1] // page 0 is in the window
      );

      // Just-created local row lands at the top (its sort position)
      expect(merged.map((r) => r.id)).toEqual(["new", "a", "b", "c"]);
    });

    it("SKIPS the overlay when page 0 has been evicted (deep window)", () => {
      // User scrolled deep: window is pages 5,6,7 — page 0 gone. A brand-new
      // local row (newest date) must NOT be injected here, or it would park a
      // top-of-list row at the wrong position deep in the window.
      const localOnly = row("new", "2026-07-06", "2026-07-06T09:00:00Z");
      const merged = mergeTransactionPages(
        [
          { rows: [row("p5", "2026-06-10"), row("p6", "2026-06-09")], localOverlay: [localOnly] },
          { rows: [row("p7", "2026-06-08")], localOverlay: [] },
        ],
        [5, 6, 7] // page 0 NOT in the window
      );

      expect(merged.map((r) => r.id)).toEqual(["p5", "p6", "p7"]);
      expect(merged.find((r) => r.id === "new")).toBeUndefined();
    });

    it("still dedupes an overlay row against its server echo even in a deep window", () => {
      // The overlay is skipped for edits too when page 0 is gone, but the
      // SERVER echo (already synced) still shows once — no duplication.
      const echoRow = row("x", "2026-06-10", "2026-06-10T08:00:00Z");
      const localEcho = { ...echoRow, edited: true };
      const merged = mergeTransactionPages<typeof localEcho>(
        [
          {
            rows: [echoRow as typeof localEcho, row("p6", "2026-06-09") as typeof localEcho],
            localOverlay: [localEcho],
          },
        ],
        [5] // page 0 evicted → overlay skipped
      );

      // Exactly one "x", and it is the server copy (overlay skipped deep)
      expect(merged.filter((r) => r.id === "x")).toHaveLength(1);
      expect(merged.find((r) => r.id === "x")?.edited).toBeUndefined();
    });

    it("applies the overlay edit (local wins) when page 0 is present", () => {
      const echoRow = row("x", "2026-07-04", "2026-07-04T08:00:00Z");
      const localEcho = { ...echoRow, edited: true };
      const merged = mergeTransactionPages<typeof localEcho>(
        [{ rows: [echoRow as typeof localEcho], localOverlay: [localEcho] }],
        [0]
      );

      expect(merged.filter((r) => r.id === "x")).toHaveLength(1);
      expect(merged.find((r) => r.id === "x")?.edited).toBe(true);
    });

    it("defaults to applying the overlay when pageParams is omitted (back-compat)", () => {
      const localOnly = row("new", "2026-07-06", "2026-07-06T09:00:00Z");
      const merged = mergeTransactionPages([
        { rows: [row("a", "2026-07-05")], localOverlay: [localOnly] },
      ]);

      expect(merged.map((r) => r.id)).toEqual(["new", "a"]);
    });

    it("does not duplicate rows across a prepend boundary (evicted page re-loaded)", () => {
      // Simulate a windowed set after fetchPreviousPage prepended page 1 in
      // front of pages 2,3. An insert between fetches pushed "b" so it appears
      // at the tail of the prepended page AND the head of the next page.
      const merged = mergeTransactionPages(
        [
          { rows: [row("a", "2026-07-05"), row("b", "2026-07-04")], localOverlay: [] },
          { rows: [row("b", "2026-07-04"), row("c", "2026-07-03")], localOverlay: [] },
        ],
        [1, 2]
      );

      expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
      expect(merged.filter((r) => r.id === "b")).toHaveLength(1);
    });
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

// ─── getLocalTransactionsWithRelations paging ────

describe("getLocalTransactionsWithRelations paging (Dexie fallback for .range())", () => {
  beforeEach(async () => {
    await db.transactions.clear();
    await db.accounts.clear();
    await db.categories.clear();

    // 7 rows, newest first after sorting: tx-06 … tx-00
    await db.transactions.bulkAdd(
      Array.from({ length: 7 }, (_, i) =>
        makeTransaction({
          id: `tx-${String(i).padStart(2, "0")}`,
          date: `2026-07-${String(i + 1).padStart(2, "0")}`,
          created_at: `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
        })
      )
    );
  });

  it("mirrors the server's offset/limit window over the sorted rows", async () => {
    const page0 = await getLocalTransactionsWithRelations(undefined, { offset: 0, limit: 3 });
    const page1 = await getLocalTransactionsWithRelations(undefined, { offset: 3, limit: 3 });
    const page2 = await getLocalTransactionsWithRelations(undefined, { offset: 6, limit: 3 });

    expect(page0.map((t) => t.id)).toEqual(["tx-06", "tx-05", "tx-04"]);
    expect(page1.map((t) => t.id)).toEqual(["tx-03", "tx-02", "tx-01"]);
    // Short last page, exactly like .range() past the end
    expect(page2.map((t) => t.id)).toEqual(["tx-00"]);
  });

  it("returns an empty page past the end of the dataset", async () => {
    expect(await getLocalTransactionsWithRelations(undefined, { offset: 9, limit: 3 })).toEqual([]);
  });

  it("pages the FILTERED set, not the raw table", async () => {
    await db.transactions.add(
      makeTransaction({ id: "tx-transfer", date: "2026-07-09", transfer_group_id: "tg-1" })
    );

    const page0 = await getLocalTransactionsWithRelations(undefined, { offset: 0, limit: 2 });

    // The transfer (newest row) is excluded by default, so the window starts
    // at the newest non-transfer row
    expect(page0.map((t) => t.id)).toEqual(["tx-06", "tx-05"]);
  });
});

// ─── getLocalTransactionsFilterSummary ───────────

describe("getLocalTransactionsFilterSummary", () => {
  beforeEach(async () => {
    await db.transactions.clear();
  });

  it("computes count and In/Out totals over the FULL dataset with filter mirroring", async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ id: "t1", type: "income", amount_cents: 500000 }),
      makeTransaction({ id: "t2", type: "expense", amount_cents: 150050 }),
      makeTransaction({ id: "t3", type: "expense", amount_cents: 9950 }),
      // Transfer leg: excluded by default like the RPC and the list query
      makeTransaction({
        id: "t4",
        type: "expense",
        amount_cents: 700000,
        transfer_group_id: "tg-1",
      }),
    ]);

    const summary = await getLocalTransactionsFilterSummary();

    expect(summary).toEqual({ count: 3, totalInCents: 500000, totalOutCents: 160000 });
  });

  it("includes transfers when excludeTransfers is false", async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ id: "t1", type: "expense", amount_cents: 10000 }),
      makeTransaction({
        id: "t2",
        type: "expense",
        amount_cents: 5000,
        transfer_group_id: "tg-1",
      }),
    ]);

    const summary = await getLocalTransactionsFilterSummary({ excludeTransfers: false });

    expect(summary).toEqual({ count: 2, totalInCents: 0, totalOutCents: 15000 });
  });

  it("applies the same filters as the server query", async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ id: "t1", type: "expense", amount_cents: 10000, date: "2026-07-01" }),
      makeTransaction({ id: "t2", type: "expense", amount_cents: 20000, date: "2026-06-01" }),
      makeTransaction({ id: "t3", type: "income", amount_cents: 30000, date: "2026-07-02" }),
    ]);

    const summary = await getLocalTransactionsFilterSummary({ dateFrom: "2026-07-01" });

    expect(summary).toEqual({ count: 2, totalInCents: 30000, totalOutCents: 10000 });
  });
});
