import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SyncQueueItem, EntityType } from "@/types/sync";

// ─── Mocks ───────────────────────────────────────
// Only the network boundary is mocked; the local outbox (db.syncQueue) is the
// real Dexie table backed by fake-indexeddb, so these tests exercise the real
// enqueue → drain → status integration.
vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/lib/sync/retry", () => ({
  calculateRetryDelay: vi.fn(() => 60_000), // predictable next_retry_at in tests
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ──────────────────────
import { SyncProcessor } from "../processor";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/dexie/db";
import { getPendingQueueItems } from "@/lib/offline/syncQueue";
import { queryClient } from "@/lib/queryClient";

// ─── Helpers ─────────────────────────────────────
function makeQueueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    entity_type: "transaction" as EntityType,
    entity_id: "entity-1",
    operation: {
      op: "create",
      payload: { id: "entity-1", description: "Test", amount_cents: 100 },
      idempotencyKey: `dev-1-transaction-entity-1-${Math.floor(Math.random() * 1e9)}`,
      lamportClock: 1,
      vectorClock: { "dev-1": 1 },
    },
    device_id: "dev-1",
    user_id: "user-1",
    status: "queued",
    retry_count: 0,
    max_retries: 3,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced_at: null,
    next_retry_at: null,
    ...overrides,
  };
}

function makeSupabaseError(message: string, code?: string): Error & { code?: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Configure the supabase.from mock. The processor uses exactly three shapes:
 * - insert(payload)            → awaited directly
 * - update(payload).eq(...)    → awaited after .eq
 * - delete().eq(...)           → awaited after .eq
 */
function setupSupabaseMock(
  options: {
    insertError?: unknown;
    updateError?: unknown;
    deleteError?: unknown;
    onTable?: (table: string) => void;
  } = {}
) {
  const { insertError = null, updateError = null, deleteError = null, onTable } = options;

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    onTable?.(table);
    return {
      insert: vi.fn(() => Promise.resolve({ error: insertError })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: updateError })) })),
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: deleteError })) })),
    };
  }) as never);
}

describe("SyncProcessor (local outbox)", () => {
  let processor: SyncProcessor;

  beforeEach(async () => {
    processor = new SyncProcessor();
    vi.clearAllMocks();
    setupSupabaseMock();
    await db.syncQueue.clear();
    await db.meta.clear();
    await db.syncIssues.clear();
  });

  describe("processQueue", () => {
    it("returns an all-zero result with empty queue", async () => {
      const result = await processor.processQueue("user-1");
      expect(result).toEqual({ synced: 0, failed: 0, terminalFailures: 0 });
    });

    it("drains queued items and marks them completed locally", async () => {
      const item1 = makeQueueItem();
      const item2 = makeQueueItem({ entity_id: "entity-2" });
      await db.syncQueue.bulkAdd([item1, item2]);

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 2, failed: 0, terminalFailures: 0 });
      const stored1 = await db.syncQueue.get(item1.id);
      const stored2 = await db.syncQueue.get(item2.id);
      expect(stored1?.status).toBe("completed");
      expect(stored1?.synced_at).toBeTruthy();
      expect(stored2?.status).toBe("completed");
    });

    it("skips items scheduled for a future retry", async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      await db.syncQueue.add(makeQueueItem({ next_retry_at: future }));

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 0, terminalFailures: 0 });
      expect(vi.mocked(supabase.from)).not.toHaveBeenCalled();
    });

    it("skips items belonging to another user", async () => {
      await db.syncQueue.add(makeQueueItem({ user_id: "someone-else" }));

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 0, terminalFailures: 0 });
    });

    it("concurrent calls share one session (item processed once)", async () => {
      const tables: string[] = [];
      setupSupabaseMock({ onTable: (t) => tables.push(t) });
      await db.syncQueue.add(makeQueueItem());

      const [r1, r2] = await Promise.all([
        processor.processQueue("user-1"),
        processor.processQueue("user-1"),
      ]);

      expect(r1).toEqual(r2);
      expect(tables.filter((t) => t === "transactions")).toHaveLength(1);
    });

    it("resets items stranded in 'syncing' by a crash and processes them", async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const stranded = makeQueueItem({ status: "syncing", updated_at: staleTime });
      await db.syncQueue.add(stranded);

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 1, failed: 0, terminalFailures: 0 });
      const stored = await db.syncQueue.get(stranded.id);
      expect(stored?.status).toBe("completed");
    });

    it("counts a rescheduled retryable failure in failed but NOT terminalFailures", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("FetchError: network request failed") });
      await db.syncQueue.add(makeQueueItem());

      const result = await processor.processQueue("user-1");

      // Item went back to "queued" with backoff - it will self-heal, so it
      // must not be reported as a terminal failure (no user-facing alarm)
      expect(result).toEqual({ synced: 0, failed: 1, terminalFailures: 0 });
    });

    it("counts a non-retryable failure in BOTH failed and terminalFailures", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError("violates check constraint on amount_cents"),
      });
      await db.syncQueue.add(makeQueueItem());

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 1, terminalFailures: 1 });
    });

    it("counts a retry-exhausted failure as terminal", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      await db.syncQueue.add(makeQueueItem({ retry_count: 3, max_retries: 3 }));

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 1, terminalFailures: 1 });
    });

    it("persists lastSyncTime in db.meta after a successful sync", async () => {
      await db.syncQueue.add(makeQueueItem());

      await processor.processQueue("user-1");

      const entry = await db.meta.get("lastSyncTime");
      expect(entry?.value).toBeTruthy();
    });

    it("invalidates transactions/accounts/dashboard queries once per drain that pushed items", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      await db.syncQueue.bulkAdd([makeQueueItem(), makeQueueItem({ entity_id: "entity-2" })]);

      await processor.processQueue("user-1");

      // Once per prefix (not per item), fired after the drain completes
      expect(invalidateSpy).toHaveBeenCalledTimes(3);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["transactions"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounts"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    });

    it("does not invalidate queries when nothing was pushed", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      await db.syncQueue.add(makeQueueItem());

      await processor.processQueue("user-1");

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe("processItem", () => {
    it("handles create: inserts payload into the entity table", async () => {
      const tables: string[] = [];
      setupSupabaseMock({ onTable: (t) => tables.push(t) });

      const result = await processor.processItem(makeQueueItem());

      expect(result.success).toBe(true);
      expect(tables).toContain("transactions");
    });

    it("treats duplicate primary key on create as already synced", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError(
          'duplicate key value violates unique constraint "transactions_pkey"',
          "23505"
        ),
      });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(true);
      const stored = await db.syncQueue.get(item.id);
      expect(stored?.status).toBe("completed");
    });

    it("handles update: calls Supabase update", async () => {
      const item = makeQueueItem({
        operation: {
          op: "update",
          payload: { description: "Updated" },
          idempotencyKey: "key-upd",
          lamportClock: 2,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);
      expect(result.success).toBe(true);
    });

    it("handles delete: calls Supabase delete", async () => {
      const item = makeQueueItem({
        operation: {
          op: "delete",
          payload: {},
          idempotencyKey: "key-del",
          lamportClock: 3,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);
      expect(result.success).toBe(true);
    });

    it("returns error for unknown operation", async () => {
      const item = makeQueueItem({
        operation: {
          op: "unknown" as never,
          payload: {},
          idempotencyKey: "key-unk",
          lamportClock: 1,
          vectorClock: {},
        },
      });
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown operation");
    });
  });

  describe("error handling", () => {
    const nonRetryableMessages = [
      "violates check constraint on amount_cents",
      "violates foreign key constraint on account_id",
      "violates unique constraint on idempotency_key",
      "invalid input syntax for type uuid",
      "value too long for type character varying(200)",
    ];

    for (const message of nonRetryableMessages) {
      it(`fails permanently for: ${message.slice(0, 40)}...`, async () => {
        setupSupabaseMock({ insertError: makeSupabaseError(message) });
        const item = makeQueueItem();
        await db.syncQueue.add(item);

        const result = await processor.processItem(item);

        expect(result.success).toBe(false);
        expect(result.terminal).toBe(true);
        const stored = await db.syncQueue.get(item.id);
        expect(stored?.status).toBe("failed");
        expect(stored?.error_message).toContain(message.split(" on ")[0]);
      });
    }

    it("schedules a retry (next_retry_at, no inline sleep) for network errors", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("FetchError: network request failed") });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(result.terminal).toBeUndefined(); // rescheduled, not terminal
      const stored = await db.syncQueue.get(item.id);
      expect(stored?.status).toBe("queued");
      expect(stored?.retry_count).toBe(1);
      expect(stored?.next_retry_at).toBeTruthy();
      expect(new Date(stored!.next_retry_at!).getTime()).toBeGreaterThan(Date.now());

      // Scheduled item is no longer due
      const due = await getPendingQueueItems("user-1");
      expect(due).toHaveLength(0);
    });

    it("fails permanently once retry_count reaches max_retries", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      const item = makeQueueItem({ retry_count: 3, max_retries: 3 });
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(result.terminal).toBe(true);
      expect(result.error).toContain("Max retries reached");
      const stored = await db.syncQueue.get(item.id);
      expect(stored?.status).toBe("failed");
    });

    it("logs a non-retryable sync issue on terminal constraint failure (R3)", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError("violates check constraint on amount_cents"),
      });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      await processor.processItem(item);

      const issues = await db.syncIssues.toArray();
      expect(issues).toHaveLength(1);
      expect(issues[0].issueType).toBe("sync-failed");
      expect(issues[0].entityType).toBe("transaction");
      expect(issues[0].entityId).toBe(item.entity_id);
      expect(issues[0].canRetry).toBe(false);
      expect(issues[0].message).toContain("violates check constraint");
    });

    it("logs a retryable sync issue when retries are exhausted (R3)", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      const item = makeQueueItem({ retry_count: 3, max_retries: 3 });
      await db.syncQueue.add(item);

      await processor.processItem(item);

      const issues = await db.syncIssues.toArray();
      expect(issues).toHaveLength(1);
      expect(issues[0].issueType).toBe("sync-failed");
      expect(issues[0].entityId).toBe(item.entity_id);
      expect(issues[0].canRetry).toBe(true);
    });

    it("does NOT log a sync issue for a retryable failure that gets rescheduled", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("FetchError: network request failed") });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      await processor.processItem(item);

      expect(await db.syncIssues.count()).toBe(0);
    });
  });

  describe("entity type to table mapping", () => {
    const mappings: [EntityType, string][] = [
      ["transaction", "transactions"],
      ["account", "accounts"],
      ["category", "categories"],
      ["budget", "budgets"],
      ["debt", "debts"],
      ["internal_debt", "internal_debts"],
      ["debt_payment", "debt_payments"],
    ];

    for (const [entityType, tableName] of mappings) {
      it(`maps ${entityType} → ${tableName}`, async () => {
        const tables: string[] = [];
        setupSupabaseMock({ onTable: (t) => tables.push(t) });

        await processor.processItem(makeQueueItem({ entity_type: entityType }));

        expect(tables).toContain(tableName);
      });
    }
  });
});
